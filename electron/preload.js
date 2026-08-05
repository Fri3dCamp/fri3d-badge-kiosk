const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // from frontend to electron
  selectBoard: (board) => ipcRenderer.invoke("selectBoard", board),
  flash: () => ipcRenderer.invoke("flash"),
  downloadAssets: () => ipcRenderer.invoke("downloadAssets"),
  downloadAsset: (kind, key) => ipcRenderer.invoke("downloadAsset", kind, key),
  getAssetsStatus: () => ipcRenderer.invoke("getAssetsStatus"),
  checkForUpdates: () => ipcRenderer.invoke("checkForUpdates"),

  // from electron to frontend
  handleFlashComplete: (callback) => {
    ipcRenderer.on("flashComplete", callback);
    return () => ipcRenderer.off("flashComplete", callback);
  },
  handleFlashError: (callback) => {
    ipcRenderer.on("flashError", callback);
    return () => ipcRenderer.off("flashError", callback);
  },
  handleStdout: (callback) => {
    ipcRenderer.on("stdout", callback);
    return () => ipcRenderer.off("stdout", callback);
  },
  handleStderr: (callback) => {
    ipcRenderer.on("stderr", callback);
    return () => ipcRenderer.off("stderr", callback);
  },
  handleError: (callback) => {
    ipcRenderer.on("error", callback);
    return () => ipcRenderer.off("error", callback);
  },
  handleDownloadProgress: (callback) => {
    ipcRenderer.on("downloadProgress", callback);
    return () => ipcRenderer.off("downloadProgress", callback);
  },
  handleDownloadComplete: (callback) => {
    ipcRenderer.on("downloadComplete", callback);
    return () => ipcRenderer.off("downloadComplete", callback);
  },
  handleDownloadError: (callback) => {
    ipcRenderer.on("downloadError", callback);
    return () => ipcRenderer.off("downloadError", callback);
  },
  handleOpenSettings: (callback) => {
    ipcRenderer.on("openSettings", callback);
    return () => ipcRenderer.off("openSettings", callback);
  },
});
