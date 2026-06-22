const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const GITHUB_REPO = "superiorcookie/Supercord";

// === Update channel configuration ===
//   - Production: BRANCH = "main",      RELEASE_TAG = "latest"
//   - Testing:    BRANCH = "fotestong", RELEASE_TAG = "dev"
const BRANCH = "fotestong";
const RELEASE_TAG = "dev";

const RELEASE_API_URL = RELEASE_TAG === "latest"
  ? `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  : `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${RELEASE_TAG}`;
const VERSION_URL = `https://github.com/${GITHUB_REPO}/raw/refs/heads/${BRANCH}/version.txt`;
const FETCH_HEADERS = { "User-Agent": "Supercord-Updater" };
const APPDATA = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : "/var/local");
const LOCALAPPDATA = process.env.LOCALAPPDATA || APPDATA;

const SUPERCORD_CORE_DIR = path.join(APPDATA, "Supercord-Core");
const ASAR_DEST = path.join(SUPERCORD_CORE_DIR, "desktop.asar");
const LOADER_DEST = path.join(SUPERCORD_CORE_DIR, "loader.js");
const VERSION_DEST = path.join(SUPERCORD_CORE_DIR, "version.txt");

let mainWindow;

function readLocalVersion() {
  try {
    return fs.readFileSync(VERSION_DEST, "utf8").trim();
  } catch {
    return "";
  }
}

function isNewer(remote, local) {
  if (!remote) return false;
  if (!local) return true;
  if (remote === local) return false;

  const r = remote.split(".").map(n => parseInt(n, 10));
  const l = local.split(".").map(n => parseInt(n, 10));
  const allNumeric = [...r, ...l].every(n => Number.isFinite(n));
  if (!allNumeric) return remote !== local;

  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] || 0;
    const b = l[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

// Fetch the latest release asar asset plus the remote version string (from version.txt on main).
async function fetchRemoteInfo() {
  const res = await fetch(RELEASE_API_URL, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error("Failed to fetch release info: " + res.statusText);

  const release = await res.json();
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asarAsset = assets.find(a => a.name === "desktop.asar");

  let remoteVersion = (release.tag_name || "").trim();
  const vr = await fetch(VERSION_URL, { headers: FETCH_HEADERS });
  if (vr.ok) remoteVersion = (await vr.text()).trim();

  return { release, asarAsset, remoteVersion };
}

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

    const { asarAsset, remoteVersion } = await fetchRemoteInfo();
    if (!asarAsset) throw new Error("desktop.asar not found in the latest release!");

    if (!fs.existsSync(SUPERCORD_CORE_DIR)) {
      fs.mkdirSync(SUPERCORD_CORE_DIR, { recursive: true });
    }

    const localVersion = readLocalVersion();
    const needsDownload = !fs.existsSync(ASAR_DEST) || isNewer(remoteVersion, localVersion);

    if (needsDownload) {
      mainWindow.webContents.send('patch-status', { step: 2, message: `Downloading desktop.asar (${remoteVersion || 'latest'})...` });

      const downloadRes = await fetch(asarAsset.browser_download_url, { headers: FETCH_HEADERS });
      if (!downloadRes.ok) throw new Error("Failed to download ASAR: " + downloadRes.statusText);

      const body = Readable.fromWeb(downloadRes.body);
      await finished(body.pipe(originalFs.createWriteStream(ASAR_DEST)));

      // Record the installed version for the auto-updater to compare against.
      if (remoteVersion) fs.writeFileSync(VERSION_DEST, remoteVersion);
    } else {
      mainWindow.webContents.send('patch-status', { step: 2, message: `Already up to date (${localVersion}). Re-injecting...` });
    }

    // Install / refresh the auto-update loader next to the asar.
    try {
      fs.copyFileSync(path.join(__dirname, 'loader.js'), LOADER_DEST);
    } catch (e) {
      console.error("Failed to install loader.js:", e);
    }

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

    // Point Discord at the auto-update loader instead of the asar directly.
    const loaderRequire = `require("${LOADER_DEST.replace(/\\/g, "/")}");`;

    let content = fs.readFileSync(indexPath, "utf8");
    if (!content.includes(loaderRequire)) {
      content = `${loaderRequire}\nmodule.exports = require('./core.asar');\n`;
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

// Returns the currently installed version, the latest available version, and whether
// Supercord is installed / an update is available. Used to populate the UI.
ipcMain.handle('get-status', async () => {
  const installed = fs.existsSync(ASAR_DEST);
  const localVersion = readLocalVersion();

  let latestVersion = "";
  let updateAvailable = false;
  try {
    const { remoteVersion } = await fetchRemoteInfo();
    latestVersion = remoteVersion;
    updateAvailable = installed && isNewer(remoteVersion, localVersion);
  } catch (e) {
    // Offline or rate limited - just report what we know locally.
    console.error("Failed to fetch remote version:", e.message);
  }

  return {
    installed,
    localVersion: localVersion || null,
    latestVersion: latestVersion || null,
    updateAvailable
  };
});
