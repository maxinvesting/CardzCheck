import "server-only";

export const MAX_CARD_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function optimizeUploadedCardImage(file: File): Promise<{
  buffer: Buffer;
  contentType: string;
  extension: string;
}> {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  const buffer = await sharp(inputBuffer, { failOnError: false })
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();

  return {
    buffer,
    contentType: "image/webp",
    extension: "webp",
  };
}
