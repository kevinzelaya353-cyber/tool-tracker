import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectImageType, IMAGE_LIMITS, processImage } from "./image.js";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } } });

describe("detectImageType", () => {
  it("reconoce JPEG, PNG y WEBP por magic bytes", async () => {
    expect(detectImageType(await solid(4, 4).jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageType(await solid(4, 4).png().toBuffer())).toBe("png");
    expect(detectImageType(await solid(4, 4).webp().toBuffer())).toBe("webp");
  });

  it("rechaza SVG, GIF y texto", async () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(await solid(4, 4).gif().toBuffer())).toBeNull();
    expect(detectImageType(Buffer.from("hola.jpg"))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("processImage", () => {
  it("elimina metadatos EXIF (autor, copyright, GPS…)", async () => {
    const input = await solid(64, 32)
      .withExif({ IFD0: { Artist: "Juan", Copyright: "Empresa" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processImage(input);
    const meta = await sharp(out.full).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("jpeg");
  });

  it("aplica la orientación EXIF antes de descartarla", async () => {
    const input = await solid(80, 40).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await processImage(input);
    expect([out.width, out.height]).toEqual([40, 80]);
    expect((await sharp(out.full).metadata()).orientation).toBeUndefined();
  });

  it("reduce imágenes grandes y genera miniatura", async () => {
    const out = await processImage(await solid(4000, 3000).jpeg().toBuffer());
    expect(Math.max(out.width, out.height)).toBe(IMAGE_LIMITS.fullMaxSide);
    const thumb = await sharp(out.thumb).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(IMAGE_LIMITS.thumbMaxSide);
  });

  it("convierte PNG a JPEG", async () => {
    const out = await processImage(await solid(10, 10).png().toBuffer());
    expect(detectImageType(out.full)).toBe("jpeg");
  });

  it("rechaza imágenes que exceden el límite de píxeles", async () => {
    const input = await solid(300, 300).png().toBuffer();
    await expect(processImage(input, { ...IMAGE_LIMITS, maxInputPixels: 10_000 })).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
  });

  it("rechaza archivos truncados", async () => {
    const jpeg = await solid(200, 200).jpeg().toBuffer();
    await expect(processImage(jpeg.subarray(0, 100))).rejects.toMatchObject({ status: 400 });
  });

  it("rechaza SVG aunque se envíe como imagen", async () => {
    await expect(processImage(Buffer.from("<svg/>"))).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
  });
});
