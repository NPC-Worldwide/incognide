const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('selectionApi', {
  complete: (bounds) => ipcRenderer.send('selection-complete', bounds),
  cancel: () => ipcRenderer.send('selection-cancel'),
});
