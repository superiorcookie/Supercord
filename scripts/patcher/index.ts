import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { createWriteStream } from "fs";

// Patcher script to inject Supercord-Core ASAR into official Discord

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

const SUPERCORD_CORE_DIR = join(APPDATA, "Supercord-Core");
const ASAR_DEST = join(SUPERCORD_CORE_DIR, "desktop.asar");
const LOADER_DEST = join(SUPERCORD_CORE_DIR, "loader.js");
const VERSION_DEST = join(SUPERCORD_CORE_DIR, "version.txt");
const LOADER_SRC = join(__dirname, "..", "..", "packages", "patcher-app", "src", "loader.js");

function readLocalVersion(): string {
    try {
        return readFileSync(VERSION_DEST, "utf8").trim();
    } catch {
        return "";
    }
}

function isNewer(remote: string, local: string): boolean {
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

async function downloadLatestAsar() {
    console.log("Fetching latest release from GitHub...");
    const res = await fetch(RELEASE_API_URL, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error("Failed to fetch release info: " + res.statusText);

    const release = await res.json();
    const asset = release.assets.find((a: any) => a.name === "desktop.asar");
    if (!asset) throw new Error("desktop.asar not found in the latest release!");

    // Determine the remote version from version.txt on the main branch, and compare.
    let remoteVersion = (release.tag_name || "").trim();
    const vr = await fetch(VERSION_URL, { headers: FETCH_HEADERS });
    if (vr.ok) remoteVersion = (await vr.text()).trim();

    if (!existsSync(SUPERCORD_CORE_DIR)) {
        mkdirSync(SUPERCORD_CORE_DIR, { recursive: true });
    }

    const localVersion = readLocalVersion();
    if (existsSync(ASAR_DEST) && !isNewer(remoteVersion, localVersion)) {
        console.log(`Already up to date (v${localVersion || "unknown"}). Skipping download.`);
        return;
    }

    console.log(`Downloading desktop.asar (${remoteVersion || "latest"})...`);

    const downloadRes = await fetch(asset.browser_download_url, { headers: FETCH_HEADERS });
    if (!downloadRes.ok) throw new Error("Failed to download ASAR: " + downloadRes.statusText);

    const body = Readable.fromWeb(downloadRes.body as any);
    await finished(body.pipe(createWriteStream(ASAR_DEST)));

    if (remoteVersion) writeFileSync(VERSION_DEST, remoteVersion);
    console.log("Download complete!");
}

function installLoader() {
    try {
        if (existsSync(LOADER_SRC)) {
            const loaderContent = readFileSync(LOADER_SRC, "utf8");
            writeFileSync(LOADER_DEST, loaderContent);
            console.log("Installed auto-update loader.");
        } else {
            console.warn("loader.js source not found at " + LOADER_SRC + " - auto-update will be unavailable.");
        }
    } catch (e: any) {
        console.error("Failed to install loader.js:", e.message);
    }
}

import * as fs from "fs";

function findDiscordCore() {
    const discordDir = join(LOCALAPPDATA, "Discord");
    if (!existsSync(discordDir)) throw new Error("Discord not found at " + discordDir);

    const apps = fs.readdirSync(discordDir).filter(f => f.startsWith("app-")).sort().reverse();
    if (apps.length === 0) throw new Error("No Discord app- folders found!");

    const appDir = join(discordDir, apps[0]);
    const modulesDir = join(appDir, "modules");
    if (!existsSync(modulesDir)) throw new Error("Modules folder not found in " + appDir);

    const cores = fs.readdirSync(modulesDir).filter(f => f.startsWith("discord_desktop_core-")).sort().reverse();
    if (cores.length === 0) throw new Error("No discord_desktop_core- folder found!");

    const coreDir = join(modulesDir, cores[0], "discord_desktop_core");
    return { indexPath: join(coreDir, "index.js"), appDir };
}

function inject() {
    const { indexPath, appDir } = findDiscordCore();
    console.log("Found Discord core at:", indexPath);

    // Point Discord at the auto-update loader instead of the asar directly,
    // so Supercord can update itself on restart.
    const loaderRequire = `require("${LOADER_DEST.replace(/\\/g, "/")}");`;

    // Replace the content
    let content = `${loaderRequire}\nmodule.exports = require('./core.asar');\n`;
    writeFileSync(indexPath, content);
    console.log("Successfully injected Supercord-Core into Discord!");
}

async function main() {
    try {
        console.log("=== Supercord-Core Discord Patcher ===");
        await downloadLatestAsar();
        installLoader();
        inject();
        console.log("Done! Please completely restart your official Discord client to see the changes.");
        console.log("Press any key to exit.");
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", () => process.exit(0));
    } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
    }
}

main();
