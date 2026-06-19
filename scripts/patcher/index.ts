import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { createWriteStream } from "fs";

// Patcher script to inject Supercord-Core ASAR into official Discord

const GITHUB_API_URL = "https://api.github.com/repos/Supercord/Supercord/releases/latest";
const APPDATA = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : "/var/local");
const LOCALAPPDATA = process.env.LOCALAPPDATA || APPDATA;

const SUPERCORD_CORE_DIR = join(APPDATA, "Supercord-Core");
const ASAR_DEST = join(SUPERCORD_CORE_DIR, "desktop.asar");

async function downloadLatestAsar() {
    console.log("Fetching latest release from GitHub...");
    const res = await fetch(GITHUB_API_URL);
    if (!res.ok) throw new Error("Failed to fetch release info: " + res.statusText);
    
    const release = await res.json();
    const asset = release.assets.find((a: any) => a.name === "desktop.asar");
    if (!asset) throw new Error("desktop.asar not found in the latest release!");
    
    console.log(`Downloading desktop.asar (v${release.tag_name})...`);
    
    if (!existsSync(SUPERCORD_CORE_DIR)) {
        mkdirSync(SUPERCORD_CORE_DIR, { recursive: true });
    }

    const downloadRes = await fetch(asset.browser_download_url);
    if (!downloadRes.ok) throw new Error("Failed to download ASAR: " + downloadRes.statusText);
    
    const body = Readable.fromWeb(downloadRes.body as any);
    await finished(body.pipe(createWriteStream(ASAR_DEST)));
    console.log("Download complete!");
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
    return join(coreDir, "index.js");
}

function inject() {
    const indexPath = findDiscordCore();
    console.log("Found Discord core at:", indexPath);

    const targetRequire = `require("${ASAR_DEST.replace(/\\/g, "/")}/patcher.js");`;
    
    let content = readFileSync(indexPath, "utf8");
    if (content.includes(targetRequire)) {
        console.log("Supercord-Core is already injected!");
        return;
    }

    // Typical Discord index.js ends with module.exports = require('./core.asar');
    if (!content.includes("module.exports = require('./core.asar');")) {
        console.log("Warning: Could not find standard core.asar require. Appending anyway.");
    }
    
    // Replace the content
    content = `${targetRequire}\nmodule.exports = require('./core.asar');\n`;
    writeFileSync(indexPath, content);
    console.log("Successfully injected Supercord-Core into Discord!");
}

async function main() {
    try {
        console.log("=== Supercord-Core Discord Patcher ===");
        await downloadLatestAsar();
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
