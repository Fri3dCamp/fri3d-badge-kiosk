// Modules to control application life and create native browser window
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("node:path");
const serve = require("electron-serve");
const flasher = require("./flasher.cjs");
const downloader = require("./downloader.cjs");

const loadURL = serve({ directory: "../build-gui" });

function buildMenuTemplate(mainWindow) {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: "Settings...",
                accelerator: "CmdOrCtrl+,",
                click: () => mainWindow.webContents.send("openSettings"),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : [
          {
            label: "File",
            submenu: [
              {
                label: "Settings...",
                accelerator: "CmdOrCtrl+,",
                click: () => mainWindow.webContents.send("openSettings"),
              },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(process.platform === "darwin"
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Speech",
                submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
              },
            ]
          : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      role: "window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  return Menu.buildFromTemplate(template);
}

async function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    fullscreen: app.isPackaged,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  Menu.setApplicationMenu(buildMenuTemplate(mainWindow));

  function sendMessage(channel, ...args) {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, ...args);
  }

  ipcMain.handle("selectBoard", async (_, board) => {
    flasher.selectBoard(board);
  });

  ipcMain.handle("flash", async () => {
    try {
      await flasher.flash();
      sendMessage("flashComplete");
    } catch (error) {
      sendMessage("stderr", `${error.message}\n`);
      sendMessage("flashError");
    }
  });

  let downloading = false;
  ipcMain.handle("downloadAssets", async () => {
    if (downloading) return;
    downloading = true;
    try {
      await downloader.downloadAll();
      // Re-check flashers and firmware now that they are downloaded
      await flasher.initialise();
      sendMessage("downloadComplete");
    } catch (error) {
      sendMessage("downloadProgress", `${error.message}\n`);
      sendMessage("downloadError");
    } finally {
      downloading = false;
    }
  });

  ipcMain.handle("downloadAsset", async (_, kind, key) => {
    if (downloading) return;
    downloading = true;
    try {
      if (kind === "flasher") {
        await downloader.downloadFlasher(key);
      } else if (kind === "firmware") {
        await downloader.downloadBoardFirmwareByKey(key);
      } else {
        throw new Error(`Unknown download kind "${kind}"`);
      }
      // Re-check available flashers/firmware; other assets may still be
      // missing after a single download, so ignore initialise errors here.
      await flasher.initialise().catch(() => {});
      sendMessage("downloadComplete");
    } catch (error) {
      sendMessage("downloadProgress", `${error.message}\n`);
      sendMessage("downloadError");
    } finally {
      downloading = false;
    }
  });

  ipcMain.handle("getAssetsStatus", async () => {
    return downloader.getAssetsStatus();
  });

  ipcMain.handle("checkForUpdates", async () => {
    return downloader.checkForUpdates();
  });

  downloader.events.on("progress", (data) => {
    console.log("download", data);
    sendMessage("downloadProgress", data);
  });

  flasher.stdout.on("data", (data) => {
    console.log("stdout", data);
    sendMessage("stdout", data);
  });

  flasher.stderr.on("data", (data) => {
    console.log("stderr", data);
    sendMessage("stderr", data);
  });

  if (app.isPackaged) {
    await loadURL(mainWindow);
  } else {
    await mainWindow.loadURL("http://localhost:7812");
    mainWindow.webContents.openDevTools({
      mode: "detach",
    });
  }
  try {
    await flasher.initialise();
  } catch (error) {
    sendMessage("error", error.message);
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
