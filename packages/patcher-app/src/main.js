const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const GITHUB_REPO = "superiorcookie/Supercord";

// === Update channels ===
// Each channel maps to a branch (source of version.txt) and a GitHub release tag
// (source of desktop.asar). The chosen channel is persisted next to the asar so the
// auto-update loader knows which channel to follow.
const CHANNELS = {
  stable: { branch: "main", releaseTag: "latest" },
  dev: { branch: "fotestong", releaseTag: "dev" }
};

function releaseApiUrl(releaseTag) {
  return releaseTag === "latest"
    ? `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
    : `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${releaseTag}`;
}

function versionUrl(branch) {
  return `https://github.com/${GITHUB_REPO}/raw/refs/heads/${branch}/version.txt`;
}

const FETCH_HEADERS = { "User-Agent": "Supercord-Updater" };
const APPDATA = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : "/var/local");
const LOCALAPPDATA = process.env.LOCALAPPDATA || APPDATA;

const SUPERCORD_CORE_DIR = path.join(APPDATA, "Supercord-Core");
const ASAR_DEST = path.join(SUPERCORD_CORE_DIR, "desktop.asar");
const LOADER_DEST = path.join(SUPERCORD_CORE_DIR, "loader.js");
const VERSION_DEST = path.join(SUPERCORD_CORE_DIR, "version.txt");
const CHANNEL_DEST = path.join(SUPERCORD_CORE_DIR, "update-channel.json");

let mainWindow;

function readLocalVersion() {
  try {
    return fs.readFileSync(VERSION_DEST, "utf8").trim();
  } catch {
    return "";
  }
}

// Returns the channel key that is currently installed ("stable" / "dev"), or null.
function readInstalledChannel() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CHANNEL_DEST, "utf8"));
    if (cfg && cfg.channel && CHANNELS[cfg.channel]) return cfg.channel;
  } catch {
    /* ignore */
  }
  return null;
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

// Fetch the release asar asset plus the remote version string for a given channel.
async function fetchRemoteInfo(channel) {
  const { branch, releaseTag } = CHANNELS[channel] || CHANNELS.stable;

  const res = await fetch(releaseApiUrl(releaseTag), { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error("Failed to fetch release info: " + res.statusText);

  const release = await res.json();
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asarAsset = assets.find(a => a.name === "desktop.asar");

  let remoteVersion = (release.tag_name || "").trim();
  const vr = await fetch(versionUrl(branch), { headers: FETCH_HEADERS });
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

ipcMain.handle('start-patch', async (event, channelArg) => {
  try {
    const channel = CHANNELS[channelArg] ? channelArg : "stable";
    mainWindow.webContents.send('patch-status', { step: 1, message: `Fetching ${channel} release info...` });

    const { asarAsset, remoteVersion } = await fetchRemoteInfo(channel);
    if (!asarAsset) throw new Error(`desktop.asar not found in the ${channel} release!`);

    if (!fs.existsSync(SUPERCORD_CORE_DIR)) {
      fs.mkdirSync(SUPERCORD_CORE_DIR, { recursive: true });
    }

    // If switching channels, always re-download even if the version looks the same.
    const installedChannel = readInstalledChannel();
    const channelChanged = installedChannel !== channel;
    const localVersion = readLocalVersion();
    const needsDownload = channelChanged || !fs.existsSync(ASAR_DEST) || isNewer(remoteVersion, localVersion);

    if (needsDownload) {
      mainWindow.webContents.send('patch-status', { step: 2, message: `Downloading ${channel} build (${remoteVersion || 'latest'})...` });

      const downloadRes = await fetch(asarAsset.browser_download_url, { headers: FETCH_HEADERS });
      if (!downloadRes.ok) throw new Error("Failed to download ASAR: " + downloadRes.statusText);

      const body = Readable.fromWeb(downloadRes.body);
      await finished(body.pipe(originalFs.createWriteStream(ASAR_DEST)));

      // Record the installed version for the auto-updater to compare against.
      if (remoteVersion) fs.writeFileSync(VERSION_DEST, remoteVersion);
    } else {
      mainWindow.webContents.send('patch-status', { step: 2, message: `Already up to date (${localVersion}). Re-injecting...` });
    }

    // Persist the selected channel so the loader follows the right branch/release.
    fs.writeFileSync(CHANNEL_DEST, JSON.stringify({ channel, ...CHANNELS[channel] }, null, 2));

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
    
    mainWindow.webContents.send('patch-status', { step: 4, message: `Successfully installed ${channel} build!` });
    return { success: true, channel };
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

// Returns the install state, the installed channel + version, and the latest version
// for both channels (so the UI can show whether an update is available per channel).
ipcMain.handle('get-status', async () => {
  const installed = fs.existsSync(ASAR_DEST);
  const localVersion = readLocalVersion();
  const installedChannel = readInstalledChannel();

  const result = {
    installed,
    installedChannel,
    localVersion: localVersion || null,
    channels: {}
  };

  await Promise.all(Object.keys(CHANNELS).map(async channel => {
    try {
      const { remoteVersion } = await fetchRemoteInfo(channel);
      const updateAvailable = installed && installedChannel === channel && isNewer(remoteVersion, localVersion);
      result.channels[channel] = { latestVersion: remoteVersion || null, updateAvailable };
    } catch (e) {
      result.channels[channel] = { latestVersion: null, updateAvailable: false };
    }
  }));

  return result;
});
