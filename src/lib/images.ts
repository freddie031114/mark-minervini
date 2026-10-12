/** Target size for a stored screenshot (base64 data URL). Firestore documents max out at 1 MiB. */
export const MAX_DATA_URL = 700_000;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

/**
 * Downscale + compress an image to a WebP data URL that fits in one Firestore document.
 * Charts stay readable: starts at 1920px wide and only shrinks further if needed.
 */
export async function compressImage(blob: Blob): Promise<string> {
  const img = await loadImage(blob);
  const w0 = img.naturalWidth || 1280;
  const h0 = img.naturalHeight || 720;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  for (const maxW of [1920, 1600, 1280, 1024, 800]) {
    const scale = Math.min(1, maxW / w0);
    canvas.width = Math.round(w0 * scale);
    canvas.height = Math.round(h0 * scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.72, 0.6]) {
      const url = canvas.toDataURL('image/webp', q);
      if (url.length <= MAX_DATA_URL) return url;
    }
  }
  throw new Error('That image is too large to store, even after compressing.');
}
