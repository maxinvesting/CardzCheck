import type { ImageInput } from "./types";

export async function createBottomCrop(
  image: ImageInput,
  ratio = 0.25
): Promise<ImageInput | null> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const buffer = Buffer.from(image.data, "base64");
    const instance = sharp(buffer, { failOnError: false });
    const metadata = await instance.metadata();
    if (!metadata.width || !metadata.height) return null;

    const cropHeight = Math.max(1, Math.round(metadata.height * ratio));
    const top = Math.max(0, metadata.height - cropHeight);

    const cropped = await instance
      .extract({ left: 0, top, width: metadata.width, height: cropHeight })
      .toBuffer();

    return {
      data: cropped.toString("base64"),
      mediaType: image.mediaType,
      source: image.source,
      hint: "bottom-crop",
    };
  } catch {
    return null;
  }
}
