const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getDistros: () => ipcRenderer.invoke('get-distros'),
    getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
    onUpdateDistros: (callback) => ipcRenderer.on('update-distros', (_event, value) => callback(value)),
    toggleDistro: (name, state) => ipcRenderer.send('toggle-distro', name, state),
    openTerminal: (name) => ipcRenderer.send('open-terminal', name),
    setAutoLaunch: (enable) => ipcRenderer.send('set-auto-launch', enable)
});
