const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const GITHUB_API_URL = "https://api.github.com/repos/superiorcookie/Supercord/releases/latest";
const APPDATA = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : "/var/local");
const LOCALAPPDATA = process.env.LOCALAPPDATA || APPDATA;

const SUPERCORD_CORE_DIR = path.join(APPDATA, "Supercord-Core");
const ASAR_DEST = path.join(SUPERCORD_CORE_DIR, "desktop.asar");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 450,
    icon: path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    resizable: false,
    frame: false,
    transparent: true
  });

  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('minimize-app', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('start-patch', async (event) => {
  try {
    mainWindow.webContents.send('patch-status', { step: 1, message: 'Fetching latest release info...' });
    
    const res = await fetch(GITHUB_API_URL);
    if (!res.ok) throw new Error("Failed to fetch release info: " + res.statusText);
    
    const release = await res.json();
    const asset = release.assets.find((a) => a.name === "desktop.asar");
    if (!asset) throw new Error("desktop.asar not found in the latest release!");

    mainWindow.webContents.send('patch-status', { step: 2, message: `Downloading desktop.asar (v${release.tag_name})...` });
    
    if (!fs.existsSync(SUPERCORD_CORE_DIR)) {
      fs.mkdirSync(SUPERCORD_CORE_DIR, { recursive: true });
    }

    const downloadRes = await fetch(asset.browser_download_url);
    if (!downloadRes.ok) throw new Error("Failed to download ASAR: " + downloadRes.statusText);
    
    const body = Readable.fromWeb(downloadRes.body);
    await finished(body.pipe(originalFs.createWriteStream(ASAR_DEST)));
    
    mainWindow.webContents.send('patch-status', { step: 3, message: 'Closing Discord & Injecting...' });
    
    // Close Discord
    const { execSync } = require('child_process');
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM Discord.exe /T', { stdio: 'ignore' });
      } else {
        execSync('killall Discord', { stdio: 'ignore' });
      }
    } catch (e) {
      // Ignore if Discord is not running
    }

    // Inject
    const discordDir = path.join(LOCALAPPDATA, "Discord");
    if (!fs.existsSync(discordDir)) throw new Error("Discord not found at " + discordDir);

    const apps = fs.readdirSync(discordDir).filter(f => f.startsWith("app-")).sort().reverse();
    if (apps.length === 0) throw new Error("No Discord app- folders found!");

    const appDir = path.join(discordDir, apps[0]);
    const modulesDir = path.join(appDir, "modules");
    if (!fs.existsSync(modulesDir)) throw new Error("Modules folder not found in " + appDir);

    const cores = fs.readdirSync(modulesDir).filter(f => f.startsWith("discord_desktop_core-")).sort().reverse();
    if (cores.length === 0) throw new Error("No discord_desktop_core- folder found!");

    const coreDir = path.join(modulesDir, cores[0], "discord_desktop_core");
    const indexPath = path.join(coreDir, "index.js");

    const targetRequire = `require("${ASAR_DEST.replace(/\\/g, "/")}/patcher.js");`;
    
    let content = fs.readFileSync(indexPath, "utf8");
    if (!content.includes(targetRequire)) {
      content = `${targetRequire}\nmodule.exports = require('./core.asar');\n`;
      fs.writeFileSync(indexPath, content);
    }
    
    // Clean up old Vencord resources/app.asar injections that cause dual-loading crashes
    const resourcesDir = path.join(appDir, "resources");
    const appAsarPath = path.join(resourcesDir, "app.asar");
    const backupAsarPath = path.join(resourcesDir, "_app.asar");
    if (fs.existsSync(backupAsarPath) && fs.existsSync(appAsarPath)) {
      try {
        fs.unlinkSync(appAsarPath);
        fs.renameSync(backupAsarPath, appAsarPath);
      } catch (e) {
        console.error("Failed to clean up resources/app.asar:", e);
      }
    }
    
    mainWindow.webContents.send('patch-status', { step: 4, message: 'Successfully Patched!' });
    return { success: true };
  } catch (err) {
    console.error(err);
    mainWindow.webContents.send('patch-status', { step: -1, message: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('start-unpatch', async (event) => {
  try {
    mainWindow.webContents.send('patch-status', { step: 1, message: 'Closing Discord...' });
    
    // Close Discord
    const { execSync } = require('child_process');
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM Discord.exe /T', { stdio: 'ignore' });
      } else {
        execSync('killall Discord', { stdio: 'ignore' });
      }
    } catch (e) {
      // Ignore if Discord is not running
    }

    mainWindow.webContents.send('patch-status', { step: 2, message: 'Reverting Discord to normal...' });

    // Uninject
    const discordDir = path.join(LOCALAPPDATA, "Discord");
    if (!fs.existsSync(discordDir)) throw new Error("Discord not found at " + discordDir);

    const apps = fs.readdirSync(discordDir).filter(f => f.startsWith("app-")).sort().reverse();
    if (apps.length === 0) throw new Error("No Discord app- folders found!");

    const appDir = path.join(discordDir, apps[0]);
    const modulesDir = path.join(appDir, "modules");
    if (!fs.existsSync(modulesDir)) throw new Error("Modules folder not found in " + appDir);

    const cores = fs.readdirSync(modulesDir).filter(f => f.startsWith("discord_desktop_core-")).sort().reverse();
    if (cores.length === 0) throw new Error("No discord_desktop_core- folder found!");

    const coreDir = path.join(modulesDir, cores[0], "discord_desktop_core");
    const indexPath = path.join(coreDir, "index.js");

    if (fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, "module.exports = require('./core.asar');\n");
    }
    
    mainWindow.webContents.send('patch-status', { step: 4, message: 'Successfully Uninstalled (Settings Kept)!' });
    return { success: true };
  } catch (err) {
    console.error(err);
    mainWindow.webContents.send('patch-status', { step: -1, message: err.message });
    return { success: false, error: err.message };
  }
});
