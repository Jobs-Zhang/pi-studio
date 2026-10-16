const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgFiles = fs.readdirSync(__dirname).filter(f => f.startsWith('icon-v') && f.endsWith('.svg'));

async function convert() {
  for (const file of svgFiles) {
    const svgPath = path.join(__dirname, file);
    const pngPath = file.replace('.svg', '.png');
    await sharp(svgPath).resize(256, 256).png().toFile(path.join(__dirname, pngPath));
    console.log(`Created: ${pngPath}`);
  }
}

convert().catch(console.error);