const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('ecom', {
  openMedia: () => inv('open-media'),
  probe: p => inv('probe-media', p),
  thumbnail: (p, type, dur) => inv('thumbnail', p, type, dur),
  waveform: p => inv('waveform', p),
  makeProxy: p => inv('make-proxy', p),
  fileExists: p => inv('file-exists', p),
  saveProject: d => inv('save-project', d),
  loadProject: () => inv('load-project'),
  pickExportPath: n => inv('pick-export-path', n),
  exportVideo: j => inv('export-video', j),
  cancelExport: () => inv('cancel-export'),
  revealFile: p => inv('reveal-file', p),
  pathForFile: f => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  onExportProgress: cb => ipcRenderer.on('export-progress', (_, d) => cb(d))
});
