const sharp = require('sharp');
const path = require('path');

const svgPath = path.join(__dirname, 'app-icon.svg');
const pngPath = path.join(__dirname, 'icon.png');

sharp(svgPath)
  .resize(512, 512)
  .png()
  .toFile(pngPath)
  .then(() => console.log('Icon created: icon.png'))
  .catch(err => console.error('Error:', err));