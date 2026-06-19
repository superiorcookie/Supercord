const asar = require("@electron/asar");
const fs = require("fs");
const path = require("path");

const coreAsarPath = "C:\\Users\\superior\\AppData\\Roaming\\discord\\1.0.9242\\modules\\discord_desktop_core\\core.asar";
if (!fs.existsSync(coreAsarPath)) {
    console.error("core.asar not found");
    process.exit(1);
}

const fileList = asar.listPackage(coreAsarPath);
for (const file of fileList) {
    if (file.endsWith(".js")) {
        const content = asar.extractFile(coreAsarPath, file).toString();
        if (content.includes("RTCConnectionMenu")) {
            console.log(`Found in ${file}!`);
            const snippetIndex = content.indexOf("RTCConnectionMenu");
            const start = Math.max(0, snippetIndex - 1000);
            const end = Math.min(content.length, snippetIndex + 1000);
            fs.writeFileSync("found_snippet.js", content.substring(start, end));
            console.log("Snippet written to found_snippet.js");
            break;
        }
    }
}
