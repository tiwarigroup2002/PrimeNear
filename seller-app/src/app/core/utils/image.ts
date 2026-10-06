/**
 * Shrinks a photo in the browser before upload (max 1600px, quality 0.8) so uploads
 * are fast on mobile data. The server compresses again; this only saves bandwidth.
 * GIF / SVG and files that would not get smaller are returned unchanged.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.size >= file.size) return file;
    const name = type === 'image/jpeg' ? file.name.replace(/\.\w+$/, '') + '.jpg' : file.name;
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}
