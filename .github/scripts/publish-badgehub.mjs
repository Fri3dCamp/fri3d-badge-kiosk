import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://direct.badgehub.eu/api/v3";
const apiToken = process.env.BADGEHUB_API_TOKEN;
const project = process.env.BADGEHUB_PROJECT;
const assetsDirectory = process.env.RELEASE_ASSETS_DIR;
const releaseTag = process.env.RELEASE_TAG;

if (!apiToken || !project || !assetsDirectory || !releaseTag) {
  throw new Error(
    "BADGEHUB_API_TOKEN, BADGEHUB_PROJECT, RELEASE_ASSETS_DIR and RELEASE_TAG are required"
  );
}

const versionMatch = releaseTag.match(/^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
if (!versionMatch) {
  throw new Error(`Release tag ${releaseTag} is not a semantic version`);
}
const version = versionMatch[1];

const assetNames = (await readdir(assetsDirectory)).sort();
if (assetNames.length === 0) {
  throw new Error("The GitHub release has no downloadable assets");
}

const localAssets = new Map();
for (const name of assetNames) {
  if (name === "metadata.json") {
    throw new Error(
      "metadata.json is reserved by BadgeHub and cannot be a release asset"
    );
  }
  const filePath = path.join(assetsDirectory, name);
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) continue;
  const contents = await readFile(filePath);
  localAssets.set(name, {
    filePath,
    size: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}
if (localAssets.size === 0) {
  throw new Error("The GitHub release has no downloadable files");
}

function isManagedReleaseAsset(name) {
  // This BadgeHub project mirrors the release: metadata.json is maintained by
  // BadgeHub and every other project file is a GitHub release asset.
  return name !== "metadata.json";
}

function getFiles(projectDetails) {
  return projectDetails.version?.files ?? [];
}

function releaseMatches(projectDetails) {
  if (projectDetails.version?.app_metadata?.version !== version) return false;

  const remoteAssets = getFiles(projectDetails).filter((file) =>
    isManagedReleaseAsset(file.full_path)
  );
  if (remoteAssets.length !== localAssets.size) return false;

  return remoteAssets.every((file) => {
    const local = localAssets.get(file.full_path);
    return (
      local !== undefined &&
      local.size === file.size_of_content &&
      local.sha256 === file.sha256
    );
  });
}

async function badgeHubRequest(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "User-Agent": "fri3d-badge-kiosk-github-action",
      "badgehub-api-token": apiToken,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${options.method ?? "GET"} ${endpoint} failed (${response.status}): ${body}`
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

const currentProject = await badgeHubRequest(
  `/projects/${encodeURIComponent(project)}`
);
if (releaseMatches(currentProject)) {
  console.log(`BadgeHub ${project} already matches ${releaseTag}; nothing to do.`);
  process.exit(0);
}

const draft = await badgeHubRequest(
  `/projects/${encodeURIComponent(project)}/draft`
);

for (const file of getFiles(draft)) {
  if (!isManagedReleaseAsset(file.full_path)) continue;
  console.log(`Removing old BadgeHub asset ${file.full_path}`);
  await badgeHubRequest(
    `/projects/${encodeURIComponent(project)}/draft/files/${encodeURIComponent(file.full_path)}`,
    { method: "DELETE" }
  );
}

for (const [name, asset] of localAssets) {
  console.log(`Uploading ${name} (${asset.size} bytes)`);
  const form = new FormData();
  form.append("file", new Blob([await readFile(asset.filePath)]), name);
  await badgeHubRequest(
    `/projects/${encodeURIComponent(project)}/draft/files/${encodeURIComponent(name)}`,
    { method: "POST", body: form }
  );
}

const metadata = {
  ...draft.version.app_metadata,
  version,
};
await badgeHubRequest(
  `/projects/${encodeURIComponent(project)}/draft/metadata`,
  {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  }
);

const updatedDraft = await badgeHubRequest(
  `/projects/${encodeURIComponent(project)}/draft`
);
if (!releaseMatches(updatedDraft)) {
  throw new Error("BadgeHub draft verification failed; refusing to publish");
}

await badgeHubRequest(`/projects/${encodeURIComponent(project)}/publish`, {
  method: "PATCH",
});

let publishedProject;
for (let attempt = 1; attempt <= 5; attempt += 1) {
  publishedProject = await badgeHubRequest(
    `/projects/${encodeURIComponent(project)}`
  );
  if (releaseMatches(publishedProject)) break;
  if (attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
if (!releaseMatches(publishedProject)) {
  throw new Error("BadgeHub published revision does not match the GitHub release");
}

console.log(
  `Published ${localAssets.size} GitHub release assets as BadgeHub ${project} ${version}.`
);
