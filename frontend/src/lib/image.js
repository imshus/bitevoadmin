// Shrinks a photo in the browser before it is stored, so a 5 MB phone photo becomes ~100 KB.

async function decode(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Returns a JPEG data URL no larger than `maxSize` pixels on its longest side.
export async function shrinkImage(file, { maxSize = 800, quality = 0.82 } = {}) {
  const source = await decode(file);
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // JPEG has no transparency; keep see-through PNGs on white
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  source.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}
