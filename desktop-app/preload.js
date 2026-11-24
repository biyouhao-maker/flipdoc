const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("FlipDocDesktop", {
  isDesktop: true,
  scanChatFiles: () => ipcRenderer.invoke("flipdoc:scan-chat-files"),
  pickCustomChatFolder: () => ipcRenderer.invoke("flipdoc:pick-custom-folder"),
  importScannedFile: (fileId) => ipcRenderer.invoke("flipdoc:import-scanned-file", fileId),
  installWindowsShortcuts: () => ipcRenderer.invoke("flipdoc:install-shortcuts"),
  openServerSettings: () => ipcRenderer.send("flipdoc:open-server-settings"),
  getAppVersion: () => "1.1.0",
});
