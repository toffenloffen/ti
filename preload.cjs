const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tiProjects', {
  list: () => ipcRenderer.invoke('ti-projects:list'),
  add: () => ipcRenderer.invoke('ti-projects:add'),
  remove: id => ipcRenderer.invoke('ti-projects:remove', id)
});
contextBridge.exposeInMainWorld('tiLanguage', {
  get: () => ipcRenderer.invoke('ti-language:get'),
  set: language => ipcRenderer.invoke('ti-language:set', language)
});
