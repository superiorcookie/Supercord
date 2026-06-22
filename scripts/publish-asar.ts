import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
    try {
        console.log("=== Build & Publish ASAR ===");

        // 1. Build the core
        console.log("Building Supercord-core...");
        execSync("pnpm install", { cwd: "Supercord-core", stdio: "inherit" });
        execSync("pnpm run build", { cwd: "Supercord-core", stdio: "inherit" });

        const asarPath = join(process.cwd(), "Supercord-core", "dist", "desktop.asar");
        if (!existsSync(asarPath)) {
            throw new Error(`Build failed, could not find desktop.asar at ${asarPath}`);
        }

        // 1b. Resolve the version to publish (from version.txt, falling back to the core package.json)
        const versionTxtPath = join(process.cwd(), "version.txt");
        let version = "";
        if (existsSync(versionTxtPath)) {
            version = readFileSync(versionTxtPath, "utf8").trim();
        }
        if (!version) {
            try {
                const corePkg = JSON.parse(readFileSync(join(process.cwd(), "Supercord-core", "package.json"), "utf8"));
                version = String(corePkg.version || "").trim();
            } catch {
                /* ignore */
            }
        }
        if (!version) version = `build-${Date.now()}`;

        // Write version.txt next to the asar so it can be uploaded as a release asset.
        const versionAssetPath = join(process.cwd(), "Supercord-core", "dist", "version.txt");
        writeFileSync(versionAssetPath, version + "\n");
        console.log(`Publishing version: ${version}`);

        // 2. Publish to GitHub using GH CLI
        console.log("Uploading to latest GitHub release...");
        
        // Find the repository from git remote
        const repo = "superiorcookie/Supercord";

        console.log(`Using repository: ${repo}`);

        const GITHUB_CLI = process.env.GITHUB_ACTIONS ? "gh" : '"C:\\Program Files\\GitHub CLI\\gh.exe"';

        // Find latest release tag
        let tag = "latest";
        try {
            const tagBuffer = execSync(`${GITHUB_CLI} release view --repo ${repo} --json tagName -q .tagName`, { stdio: "pipe" });
            tag = tagBuffer.toString().trim();
            if (!tag) tag = "latest";
            
            console.log(`Uploading to existing tag: ${tag}`);
            execSync(`${GITHUB_CLI} release upload ${tag} "${asarPath}" "${versionAssetPath}" --repo ${repo} --clobber`, { stdio: "inherit" });
        } catch (e) {
            console.log(`No release found on ${repo}. Creating a new '${tag}' release...`);
            execSync(`${GITHUB_CLI} release create ${tag} "${asarPath}" "${versionAssetPath}" --repo ${repo} --title "Latest Release" --notes "Auto-published release."`, { stdio: "inherit" });
        }

        console.log("Success! The newest ASAR is now live on GitHub.");
    } catch (e: any) {
        console.error("Error publishing ASAR:", e.message);
        process.exit(1);
    }
}

main();
