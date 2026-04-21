/**
 * Resizes an image to a maximum width or height while maintaining aspect ratio
 * and returns it as a base64 string.
 * 
 * @param forceJpeg - If true, always outputs JPEG regardless of input format.
 *   Use this for large images (hero banners) because PNG ignores the quality
 *   parameter and produces uncompressed output that easily exceeds Firestore limits.
 */
export const resizeImage = (
  base64Str: string,
  maxWidth: number = 1200,
  maxHeight: number = 800,
  quality: number = 0.7,
  forceJpeg: boolean = false
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Fill white background when converting PNG→JPEG (avoids black fill on transparency)
      if (forceJpeg) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Determine output MIME type
      let mimeType = 'image/jpeg';
      if (!forceJpeg) {
        const mimeMatch = base64Str.match(/^data:(image\/[^;]+);/);
        mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      }

      const resizedBase64 = canvas.toDataURL(mimeType, quality);
      resolve(resizedBase64);
    };
    img.onerror = (error) => reject(error);
  });
};

/**
 * Returns the approximate byte size of a base64-encoded data URL string.
 * Useful for checking against Firestore's 1,048,487 byte document limit.
 */
export function base64ByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || dataUrl;
  return Math.floor((base64.length * 3) / 4);
}
