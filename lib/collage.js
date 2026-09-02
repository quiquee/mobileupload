const sharp = require('sharp');

const TILE_SIZE = 512;

// Arranges N photos into a roughly-square grid of equal tiles (cover-cropped, so
// mixed aspect ratios don't distort) and flattens them into a single JPEG buffer.
// Used so the jewel recognizer can send one combined image per jewel to Comfy Cloud
// instead of one call per uploaded photo.
async function buildCollage(imagePaths) {
  if (imagePaths.length === 0) {
    throw new Error('buildCollage requires at least one image');
  }

  const columns = Math.ceil(Math.sqrt(imagePaths.length));
  const rows = Math.ceil(imagePaths.length / columns);

  const tiles = await Promise.all(
    imagePaths.map((imagePath) =>
      sharp(imagePath)
        .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
        .jpeg()
        .toBuffer()
    )
  );

  const composites = tiles.map((tileBuffer, index) => ({
    input: tileBuffer,
    left: (index % columns) * TILE_SIZE,
    top: Math.floor(index / columns) * TILE_SIZE
  }));

  const canvas = sharp({
    create: {
      width: columns * TILE_SIZE,
      height: rows * TILE_SIZE,
      channels: 3,
      background: { r: 20, g: 20, b: 20 }
    }
  });

  return canvas.composite(composites).jpeg({ quality: 90 }).toBuffer();
}

module.exports = { buildCollage, TILE_SIZE };
