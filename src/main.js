const { app, BrowserWindow, ipcMain, session, globalShortcut } = require('electron');
const path = require('path');
const Store = require('electron-store');
const log = require('electron-log');
// Import Library Thermal
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');

// --- 1. CONFIG & LOGGING ---
log.info('Aplikasi Electron Photobooth dimulai...');

const store = new Store({
  defaults: {
    appUrl: 'https://google.com',
    kiosk: false,
    printerName: 'POS58', // PENTING: Isi nama printer POS58 Anda di sini (sesuai nama di CUPS/Settings Ubuntu)
    debugMode: true
  }
});

let mainWindow;

function createWindow() {
  const isKiosk = store.get('kiosk');
  const targetUrl = store.get('appUrl');
  const isDebug = store.get('debugMode');

  // --- 2. BROWSER WINDOW ---
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    kiosk: isKiosk,
    fullscreen: isKiosk,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false 
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Mode Dev: Load Test Page
  // Mode Prod: Load targetUrl
  // mainWindow.loadURL(targetUrl); 
  mainWindow.loadFile(path.join(__dirname, 'test.html')); // Gunakan ini dulu untuk test POS58B

  if (isDebug) {
    mainWindow.webContents.openDevTools();
  }

  // --- 3. PERMISSION HANDLER ---
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'fullscreen'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC HANDLER 1: PRINT STRUK (ESC/POS) ---
ipcMain.handle('print-escpos', async (event, data) => {
  log.info('Memproses perintah ESC/POS...');
  
  const printerName = store.get('printerName');
  
  if (!printerName) {
    return { success: false, error: "Nama printer belum diset di Config! Harap isi printerName." };
  }

  // Konfigurasi Printer Thermal
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON, // POS58B biasanya protokol EPSON
    interface: `printer:${printerName}`, // Linux CUPS Driver
    characterSet: CharacterSet.PC852_LATIN2,
    removeSpecialCharacters: false,
    lineCharacter: "=",
    width: 32, // POS 58mm biasanya sekitar 32-42 karakter
    options:{
      timeout: 5000 
    }
  });

  try {
    // Cek koneksi printer
    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) log.warn("Printer mungkin tidak terkoneksi, mencoba kirim paksa...");

    // 1. Header
    printer.alignCenter();
    printer.bold(true);
    printer.println("PHOTOBOOTH APP");
    printer.bold(false);
    printer.println("POS58B Test Print");
    printer.drawLine(); 
    
    // 2. Konten dari Website
    printer.alignLeft();
    if (data && data.text) {
        printer.println(data.text);
    }
    
    // 3. Footer
    printer.newLine();
    printer.alignCenter();
    printer.println("Terima Kasih!");
    printer.newLine();
    printer.cut(); // Potong kertas (jika support)
    
    // 4. Eksekusi
    await printer.execute(); 
    log.info("Print ESC/POS Berhasil dikirim!");
    return { success: true };

  } catch (error) {
    log.error('Gagal Print ESC/POS:', error);
    return { success: false, error: error.message };
  }
});

// --- IPC HANDLER 2: PRINT BIASA (Browser Print) ---
ipcMain.handle('print-silent', async (event, options) => {
  log.info('Menerima perintah cetak biasa...');
  const win = BrowserWindow.fromWebContents(event.sender);
  
  const configPrinterName = store.get('printerName');
  const targetDevice = configPrinterName ? configPrinterName : undefined;

  const printOptions = {
    silent: true,
    printBackground: true,
    color: true,
    deviceName: targetDevice 
  };

  try {
    return new Promise((resolve, reject) => {
        win.webContents.print(printOptions, (success, errorType) => {
            if (!success) {
                log.error(`Gagal mencetak: ${errorType}`);
                resolve({ success: false, error: errorType });
            } else {
                log.info('✅ Cetak biasa terkirim.');
                resolve({ success: true });
            }
        });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// --- IPC HANDLER 3: CONFIG ---
ipcMain.handle('get-config', () => {
  return store.store;
});

// --- APP LIFECYCLE ---
app.whenReady().then(() => {
  createWindow();

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});