const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createHash } = require("crypto");
const { platform, arch } = require("process");
const EventEmitter = require("node:events");
const extractZip = require("extract-zip");
const {
  loadBoardsManifest,
  getAssetsDirectory,
} = require("./flasher.cjs");

const events = new EventEmitter();

function progress(message) {
  events.emit("progress", message);
}

// Where to get the flashing tools. Assets are resolved through the GitHub
// "latest release" API and matched per platform-arch. Version numbers in
// asset names are matched with a wildcard so new releases keep working.
const FLASHER_SOURCES = {
  esptool: {
    repo: "espressif/esptool",
    assetPatterns: {
      "win32-x64": /^esptool(-v[\d.]+)?-windows-amd64\.zip$/,
      "darwin-x64": /^esptool(-v[\d.]+)?-macos-amd64\.tar\.gz$/,
      "darwin-arm64": /^esptool(-v[\d.]+)?-macos-arm64\.tar\.gz$/,
      "linux-x64": /^esptool(-v[\d.]+)?-linux-amd64\.tar\.gz$/,
      "linux-arm64": /^esptool(-v[\d.]+)?-linux-aarch64\.tar\.gz$/,
    },
  },
  avrdude: {
    repo: "avrdudes/avrdude",
    assetPatterns: {
      "win32-x64": /^avrdude(-v[\d.]+)?-windows-x64\.zip$/,
      "win32-arm64": /^avrdude(-v[\d.]+)?-windows-arm64\.zip$/,
      // Only a single 64bit macOS build is published, it runs on Apple
      // Silicon through Rosetta.
      "darwin-x64": /^avrdude_v[\d.]+_macOS_64bit\.tar\.gz$/,
      "darwin-arm64": /^avrdude_v[\d.]+_macOS_64bit\.tar\.gz$/,
      "linux-x64": /^avrdude_v[\d.]+_Linux_64bit\.tar\.gz$/,
      "linux-arm64": /^avrdude_v[\d.]+_Linux_ARM64\.tar\.gz$/,
    },
  },
  wchisp: {
    repo: "ch32-rs/wchisp",
    assetPatterns: {
      "win32-x64": /^wchisp(-v[\d.]+)?-win-x64\.zip$/,
      "darwin-x64": /^wchisp(-v[\d.]+)?-macos-x64\.tar\.gz$/,
      "darwin-arm64": /^wchisp(-v[\d.]+)?-macos-arm64\.tar\.gz$/,
      "linux-x64": /^wchisp(-v[\d.]+)?-linux-x64\.tar\.gz$/,
      "linux-arm64": /^wchisp(-v[\d.]+)?-linux-aarch64\.tar\.gz$/,
    },
  },
};

const BADGEHUB_API_URL = "https://badgehub.eu/api/v3";
const FETCH_HEADERS = {
  "User-Agent": "fri3d-badge-kiosk",
};

async function fetchLatestRelease(repo) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
    { headers: { ...FETCH_HEADERS, Accept: "application/vnd.github+json" } }
  );
  if (!response.ok) {
    throw new Error(
      `Could not fetch latest release of ${repo} (HTTP ${response.status})`
    );
  }
  return response.json();
}

async function downloadFile(url, destination, expectedFile = null) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}): ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (expectedFile) {
    if (buffer.length !== expectedFile.size_of_content) {
      throw new Error(
        `Firmware size mismatch: expected ${expectedFile.size_of_content} bytes, received ${buffer.length}`
      );
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (sha256.toLowerCase() !== expectedFile.sha256.toLowerCase()) {
      throw new Error(
        `Firmware SHA-256 mismatch: expected ${expectedFile.sha256}, received ${sha256}`
      );
    }
  }
  await fs.promises.writeFile(destination, buffer);
  return response.url || url;
}

async function fetchBadgeHubJson(url) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`BadgeHub request failed (HTTP ${response.status}): ${url}`);
  }
  return response.json();
}

async function resolveBadgeHubFirmware({ project, file }) {
  const projectUrl = `${BADGEHUB_API_URL}/projects/${encodeURIComponent(project)}`;
  const versions = await fetchBadgeHubJson(`${projectUrl}/versions`);
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`No published BadgeHub versions found for ${project}`);
  }

  const latest = versions.reduce((current, candidate) =>
    Date.parse(candidate.latestPublishDate) > Date.parse(current.latestPublishDate)
      ? candidate
      : current
  );
  const revision = await fetchBadgeHubJson(
    `${projectUrl}/rev${latest.latestRevision}`
  );
  const firmwareFile = revision.version?.files?.find(
    (candidate) => candidate.full_path === file
  );
  if (!firmwareFile) {
    throw new Error(`Could not find ${file} in BadgeHub project ${project}`);
  }

  return {
    file: firmwareFile,
    version: latest.version?.trim() || `rev${latest.latestRevision}`,
  };
}

// Version bookkeeping: every download records what was fetched in a
// versions.json file next to the downloaded assets, so the settings
// menu can show which version is installed.
async function readVersions(directory) {
  try {
    const data = await fs.promises.readFile(
      path.resolve(directory, "versions.json"),
      "utf-8"
    );
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function recordVersion(directory, key, entry) {
  const versions = await readVersions(directory);
  versions[key] = entry;
  await fs.promises.writeFile(
    path.resolve(directory, "versions.json"),
    JSON.stringify(versions, null, 2)
  );
}

async function extractArchive(archivePath, destination) {
  await fs.promises.mkdir(destination, { recursive: true });
  if (archivePath.endsWith(".zip")) {
    await extractZip(archivePath, { dir: path.resolve(destination) });
    return;
  }
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", archivePath, "-C", destination]);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Extracting ${archivePath} failed (tar exit ${code})`));
      }
    });
  });
}

function findFile(directory, names) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, names);
      if (found) return found;
    } else if (names.includes(entry.name)) {
      return fullPath;
    }
  }
  return null;
}

async function withTempDir(callback) {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fri3d-download-")
  );
  try {
    return await callback(tempDir);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function downloadFlasher(name) {
  if (!FLASHER_SOURCES[name]) {
    throw new Error(`Unknown flasher "${name}"`);
  }
  const flashersDir = getAssetsDirectory("flashers");
  await fs.promises.mkdir(flashersDir, { recursive: true });
  const { repo, assetPatterns } = FLASHER_SOURCES[name];
  // Fall back to the x64 build for platforms without a native build
  const pattern = assetPatterns[`${platform}-${arch}`] || assetPatterns[`${platform}-x64`];
  if (!pattern) {
    throw new Error(`No ${name} build available for ${platform}-${arch}`);
  }

  progress(`Looking up latest release of ${repo}...\n`);
  const release = await fetchLatestRelease(repo);
  const asset = release.assets.find((asset) => pattern.test(asset.name));
  if (!asset) {
    throw new Error(
      `No matching asset for ${platform}-${arch} in ${repo} ${release.tag_name}`
    );
  }

  return withTempDir(async (tempDir) => {
    progress(`Downloading ${asset.name} (${release.tag_name})...\n`);
    const archivePath = path.join(tempDir, asset.name);
    await downloadFile(asset.browser_download_url, archivePath);

    progress(`Extracting ${asset.name}...\n`);
    const extractDir = path.join(tempDir, "extracted");
    await extractArchive(archivePath, extractDir);

    const binaryName = platform === "win32" ? `${name}.exe` : name;
    const binaryPath = findFile(extractDir, [binaryName]);
    if (!binaryPath) {
      throw new Error(`Could not find ${binaryName} inside ${asset.name}`);
    }

    const target = path.join(flashersDir, binaryName);
    await fs.promises.copyFile(binaryPath, target);
    if (platform !== "win32") {
      await fs.promises.chmod(target, 0o755);
    }
    await recordVersion(flashersDir, name, {
      fileName: binaryName,
      version: release.tag_name,
      asset: asset.name,
      downloadedAt: new Date().toISOString(),
    });
    progress(`Installed ${binaryName} into "flashers" directory\n`);
    return target;
  });
}

async function downloadFlashers() {
  for (const name of Object.keys(FLASHER_SOURCES)) {
    await downloadFlasher(name);
  }
}

async function downloadBoardFirmware(board) {
  const { name, key, firmware, download } = board;
  if (!download) {
    progress(`No download source configured for ${name}, skipping\n`);
    return;
  }
  const firmwareDir = getAssetsDirectory("firmware");
  await fs.promises.mkdir(firmwareDir, { recursive: true });
  progress(`Downloading firmware for ${name}...\n`);
  const destination = path.join(firmwareDir, firmware);
  if (download.type !== "badgehub") {
    throw new Error(`Unknown download type "${download.type}" for ${name}`);
  }
  const release = await resolveBadgeHubFirmware(download);
  await downloadFile(release.file.url, destination, release.file);
  await recordVersion(firmwareDir, key, {
    fileName: firmware,
    version: release.version,
    project: download.project,
    asset: download.file,
    url: release.file.url,
    downloadedAt: new Date().toISOString(),
  });
  progress(`Saved ${firmware}\n`);
}

async function downloadBoardFirmwareByKey(boardKey) {
  const boards = await loadBoardsManifest();
  const board = boards.find((board) => board.key === boardKey);
  if (!board) {
    throw new Error(`Unknown board "${boardKey}"`);
  }
  await downloadBoardFirmware(board);
}

async function downloadFirmware() {
  const boards = await loadBoardsManifest();
  for (const board of boards) {
    await downloadBoardFirmware(board);
  }
}

async function statFile(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    return { size: stats.size, modifiedAt: stats.mtime.toISOString() };
  } catch (error) {
    return null;
  }
}

// Overview of installed flashers and firmware files with the version
// information recorded at download time, for the settings menu.
async function getAssetsStatus() {
  const flashersDir = getAssetsDirectory("flashers");
  const firmwareDir = getAssetsDirectory("firmware");
  const flasherVersions = await readVersions(flashersDir);
  const firmwareVersions = await readVersions(firmwareDir);

  const flashers = await Promise.all(
    Object.keys(FLASHER_SOURCES).map(async (name) => {
      const fileName = platform === "win32" ? `${name}.exe` : name;
      const stats = await statFile(path.join(flashersDir, fileName));
      const record = flasherVersions[name];
      return {
        key: name,
        name,
        fileName,
        installed: stats !== null,
        size: stats?.size ?? null,
        modifiedAt: stats?.modifiedAt ?? null,
        version: record?.version ?? null,
        downloadedAt: record?.downloadedAt ?? null,
      };
    })
  );

  const boards = await loadBoardsManifest();
  const firmware = await Promise.all(
    boards.map(async (board) => {
      const stats = await statFile(path.join(firmwareDir, board.firmware));
      const record = firmwareVersions[board.key];
      return {
        key: board.key,
        name: board.name,
        fileName: board.firmware,
        installed: stats !== null,
        size: stats?.size ?? null,
        modifiedAt: stats?.modifiedAt ?? null,
        version: record?.version ?? null,
        downloadedAt: record?.downloadedAt ?? null,
      };
    })
  );

  return { flashers, firmware };
}

async function downloadAll() {
  progress("Downloading flashers...\n");
  await downloadFlashers();
  progress("Downloading firmware...\n");
  await downloadFirmware();
  progress("All downloads finished!\n");
}

module.exports = {
  downloadAll,
  downloadFlasher,
  downloadBoardFirmwareByKey,
  getAssetsStatus,
  events,
};
