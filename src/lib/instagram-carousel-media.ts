import sharp from "sharp";

export interface PreparedInstagramCarouselImage {
  body: Buffer;
  keySuffix: string;
  contentType: "image/jpeg";
}

const INSTAGRAM_JPEG_BACKGROUND = "#06070A";
const INSTAGRAM_JPEG_QUALITY = 92;

export async function prepareInstagramCarouselImage(
  renderedSlide: Buffer | Uint8Array,
  slideNumber: number,
): Promise<PreparedInstagramCarouselImage> {
  const body = await sharp(renderedSlide)
    .flatten({ background: INSTAGRAM_JPEG_BACKGROUND })
    .jpeg({
      quality: INSTAGRAM_JPEG_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  return {
    body,
    keySuffix: `slide-${String(slideNumber).padStart(2, "0")}.jpg`,
    contentType: "image/jpeg",
  };
}
