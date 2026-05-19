import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareInstagramCarouselImage } from "../src/lib/instagram-carousel-media";

describe("prepareInstagramCarouselImage", () => {
  it("converts rendered PNG slides to Instagram-compatible JPEG objects", async () => {
    const png = await sharp({
      create: {
        width: 8,
        height: 10,
        channels: 4,
        background: { r: 204, g: 255, b: 0, alpha: 0.72 },
      },
    })
      .png()
      .toBuffer();

    const image = await prepareInstagramCarouselImage(png, 2);
    const metadata = await sharp(image.body).metadata();

    expect(image.keySuffix).toBe("slide-02.jpg");
    expect(image.contentType).toBe("image/jpeg");
    expect(image.body.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(10);
  });
});
