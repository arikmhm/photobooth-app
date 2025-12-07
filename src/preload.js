const { contextBridge, ipcRenderer } = require('electron');

// Mengekspos API global "photoboothAPI"
contextBridge.exposeInMainWorld('photoboothAPI', {
  
  // 1. Fungsi Print Biasa (Full Page / PDF)
  silentPrint: () => {
    return ipcRenderer.invoke('print-silent');
  },

  // 2. Fungsi Print Struk (ESC/POS Thermal)
  printReceipt: (data) => {
    return ipcRenderer.invoke('print-escpos', data);
  },

  // 3. Fungsi Ambil Config
  getConfig: () => {
    return ipcRenderer.invoke('get-config');
  },
  
  // 4. Info Versi
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  }
});