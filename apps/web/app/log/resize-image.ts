const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Shrinks a photo to at most 1600px on its longest side and re-encodes it as JPEG, so
 * uploads are quick on mobile data. Re-encoding also drops EXIF metadata, including the
 * GPS location phones embed in photos.
 */
export async function resizeToJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("This photo format isn't supported here — try a JPEG or PNG.");
  }

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error("Couldn't process the photo in this browser.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't process the photo in this browser.")),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}
