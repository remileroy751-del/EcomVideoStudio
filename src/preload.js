const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("ecom", {
  openMedia: () => ipcRenderer.invoke("open-media"),
  probe: f => ipcRenderer.invoke("probe", f),
  thumb: (f, d) => ipcRenderer.invoke("thumb", f, d),
  getStickerDir: () => ipcRenderer.invoke("sticker-dir"),
  getFxDir: () => ipcRenderer.invoke("fx-dir"),
  saveProject: d => ipcRenderer.invoke("save-project", d),
  loadProject: () => ipcRenderer.invoke("load-project"),
  pickExportPath: n => ipcRenderer.invoke("pick-export-path", n),
  exportVideo: o => ipcRenderer.invoke("export-video", o),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: o => ipcRenderer.invoke("set-settings", o),
  transcribe: o => ipcRenderer.invoke("transcribe", o),
  pathsFromFiles: files => Array.from(files).map(f => { try { return webUtils.getPathForFile(f); } catch (e) { return ""; } }).filter(Boolean),
  onExportProgress: cb => ipcRenderer.on("export-progress", (_, d) => cb(d)),
  onCaptionProgress: cb => ipcRenderer.on("caption-progress", (_, d) => cb(d))
});
