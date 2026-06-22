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

        // 2. Determine the target release based on the branch.
        //   - main / master  -> "latest" release (production)
        //   - any other branch (e.g. fotestong) -> "dev" pre-release (testing)
        const repo = "superiorcookie/Supercord";

        let branch = process.env.GITHUB_REF_NAME || process.env.BRANCH || "";
        if (!branch) {
            try {
                branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: "pipe" }).toString().trim();
            } catch {
                branch = "main";
            }
        }

        const isProd = branch === "main" || branch === "master";
        const tag = isProd ? "latest" : "dev";
        const isPrerelease = !isProd;

        console.log(`Branch: ${branch} -> release tag: ${tag}${isPrerelease ? " (pre-release)" : ""}`);
        console.log(`Using repository: ${repo}`);

        const GITHUB_CLI = process.env.GITHUB_ACTIONS ? "gh" : '"C:\\Program Files\\GitHub CLI\\gh.exe"';

        // Upload to the release for this tag, creating it if it doesn't exist yet.
        let releaseExists = true;
        try {
            execSync(`${GITHUB_CLI} release view ${tag} --repo ${repo}`, { stdio: "pipe" });
        } catch {
            releaseExists = false;
        }

        if (releaseExists) {
            console.log(`Uploading to existing release: ${tag}`);
            execSync(`${GITHUB_CLI} release upload ${tag} "${asarPath}" "${versionAssetPath}" --repo ${repo} --clobber`, { stdio: "inherit" });
        } else {
            console.log(`Creating new release: ${tag}`);
            const title = isProd ? "Latest Release" : "Dev (Testing) Release";
            const prereleaseFlag = isPrerelease ? " --prerelease" : "";
            const targetFlag = ` --target ${branch}`;
            execSync(
                `${GITHUB_CLI} release create ${tag} "${asarPath}" "${versionAssetPath}" --repo ${repo} --title "${title}" --notes "Auto-published ${tag} release."${prereleaseFlag}${targetFlag}`,
                { stdio: "inherit" }
            );
        }

        console.log("Success! The newest ASAR is now live on GitHub.");
    } catch (e: any) {
        console.error("Error publishing ASAR:", e.message);
        process.exit(1);
    }
}

main();
