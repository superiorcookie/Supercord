/*
 * Supercord auto-update loader
 *
 * This file is copied into %APPDATA%/Supercord-Core/ by the patcher, and Discord's
 * core index.js is pointed at it. It runs inside Discord's main process every time
 * Discord starts, and:
 *   1. Applies any update that was staged on a previous run (safe to swap the asar
 *      here because it hasn't been required/locked yet).
 *   2. Loads the Supercord core (the patched asar).
 *   3. In the background, checks GitHub for a newer version and, if found, downloads
 *      it for the next launch. This is what makes Supercord auto-update on restart.
 *
 * Paths are derived from __dirname, which is the Supercord-Core directory at runtime.
 */

const path = require("path");
const { Readable } = require("stream");
const { finished } = require("stream/promises");

// Use original-fs so that files named *.asar are treated as plain files instead of
// being virtualised by Electron's asar integration.
let fs;
try {
    fs = require("original-fs");
} catch {
    fs = require("fs");
}

const BASE_DIR = __dirname; // .../Supercord-Core
const ASAR = path.join(BASE_DIR, "desktop.asar");
const STAGED = path.join(BASE_DIR, "desktop.asar.new");
const STAGED_VERSION = STAGED + ".version";
const VERSION_FILE = path.join(BASE_DIR, "version.txt");
const PATCHER = path.join(ASAR, "patcher.js");

const GITHUB_API_URL = "https://api.github.com/repos/superiorcookie/Supercord/releases/latest";
const VERSION_URL = "https://github.com/superiorcookie/Supercord/raw/refs/heads/main/version.txt";
const FETCH_HEADERS = { "User-Agent": "Supercord-Updater" };

// How long to wait after startup before checking for updates (don't slow down boot).
const CHECK_DELAY_MS = 5000;

function log(...args) {
    try {
        console.log("[Supercord Updater]", ...args);
    } catch {
        /* ignore */
    }
}

function readLocalVersion() {
    try {
        return fs.readFileSync(VERSION_FILE, "utf8").trim();
    } catch {
        return "";
    }
}

/**
 * Returns true if `remote` is a newer version than `local`.
 * Compares dot-separated numeric segments (e.g. 1.14.13.3), falling back to
 * "different string => update available" when versions aren't purely numeric.
 */
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

// --- 1. Apply a staged update from a previous run -------------------------------
try {
    if (fs.existsSync(STAGED)) {
        fs.rmSync(ASAR, { force: true });
        fs.renameSync(STAGED, ASAR);
        if (fs.existsSync(STAGED_VERSION)) {
            fs.rmSync(VERSION_FILE, { force: true });
            fs.renameSync(STAGED_VERSION, VERSION_FILE);
        }
        log("Applied staged update. Now on version", readLocalVersion() || "(unknown)");
    }
} catch (e) {
    log("Failed to apply staged update:", e && e.message);
}

// --- 2. Load the patched Supercord core -----------------------------------------
try {
    require(PATCHER);
} catch (e) {
    log("Failed to load Supercord core:", e && e.message);
}

// --- 3. Background update check (applies on next restart) ------------------------
async function checkForUpdates() {
    // The latest version is read from version.txt on the main branch.
    const vr = await fetch(VERSION_URL, { headers: FETCH_HEADERS });
    if (!vr.ok) throw new Error("Failed to fetch version.txt: " + vr.status);
    const remoteVersion = (await vr.text()).trim();

    const localVersion = readLocalVersion();
    if (!isNewer(remoteVersion, localVersion)) {
        log("Up to date (" + (localVersion || "unknown") + ").");
        return;
    }

    log("Update available:", localVersion || "unknown", "->", remoteVersion, "- downloading for next launch...");

    // The asar itself is downloaded from the latest GitHub release.
    const res = await fetch(GITHUB_API_URL, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error("Failed to fetch release info: " + res.status);

    const release = await res.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asarAsset = assets.find(a => a.name === "desktop.asar");
    if (!asarAsset) throw new Error("No desktop.asar asset in latest release");

    const dl = await fetch(asarAsset.browser_download_url, { headers: FETCH_HEADERS });
    if (!dl.ok) throw new Error("Failed to download update: " + dl.status);

    const tmp = STAGED + ".download";
    await finished(Readable.fromWeb(dl.body).pipe(fs.createWriteStream(tmp)));
    fs.rmSync(STAGED, { force: true });
    fs.renameSync(tmp, STAGED);
    fs.writeFileSync(STAGED_VERSION, remoteVersion);

    log("Update downloaded. It will be applied the next time you restart Discord.");
}

setTimeout(() => {
    checkForUpdates().catch(e => log("Update check failed:", e && e.message));
}, CHECK_DELAY_MS);
