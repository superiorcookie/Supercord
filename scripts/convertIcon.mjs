import sharp from 'sharp';
import fs from 'fs';
import pngToIco from 'png-to-ico';

async function convertIcon() {
    const svgBuffer = fs.readFileSync('Supercord.svg');
    
    // Create a 256x256 PNG
    await sharp(svgBuffer)
        .resize(256, 256)
        .png()
        .toFile('build/icon.png');
        
    // Create high-res PNG for macOS/Linux
    await sharp(svgBuffer)
        .resize(512, 512)
        .png()
        .toFile('build/icon-512.png');

    // Convert PNG to ICO
    const icoBuffer = await pngToIco('build/icon.png');
    fs.writeFileSync('build/icon.ico', icoBuffer);
    
    console.log('Successfully converted Supercord.svg to build/icon.ico and build/icon.png');
}

convertIcon().catch(console.error);
