/**
 * Resizes an image to a maximum width or height while maintaining aspect ratio
 * and returns it as a base64 string.
 */
export const resizeImage = (
  base64Str: string,
  maxWidth: number = 1200,
  maxHeight: number = 800,
  quality: number = 0.7
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

      ctx.drawImage(img, 0, 0, width, height);

      // Extract the original MIME type (e.g. data:image/png;base64)
      const mimeMatch = base64Str.match(/^data:(image\/[^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      // Convert to base64 with specified quality, using the original format
      // so transparent PNGs and WEBP images retain their transparency.
      const resizedBase64 = canvas.toDataURL(mimeType, quality);
      resolve(resizedBase64);
    };
    img.onerror = (error) => reject(error);
  });
};
