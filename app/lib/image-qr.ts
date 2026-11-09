import Jimp from "jimp";
import jsQR from "jsqr";
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer,
} from "@zxing/library";

export type QRDecodeResult = {
  data: string;
  width: number;
  height: number;
  method: string;
};

function isProbablyAadhaarSecureQR(data: string): boolean {
  const s = data.trim();

  return (
    /^\d+$/.test(s) &&
    s.length >= 300 &&
    s.length <= 15000
  );
}

function rgbaToLuminance(
  bitmap: {
    width: number;
    height: number;
    data: Buffer;
  }
): Uint8ClampedArray {
  const { width, height, data } = bitmap;

  const out = new Uint8ClampedArray(width * height);

  for (let i = 0; i < out.length; i++) {
    const o = i * 4;

    out[i] =
      ((data[o] * 77 +
        data[o + 1] * 150 +
        data[o + 2] * 29) >> 8);
  }

  return out;
}

function decodeZXing(
  bitmap: {
    width: number;
    height: number;
    data: Buffer;
  }
): string | null {
  try {
    const luminances = rgbaToLuminance(bitmap);

    const source = new RGBLuminanceSource(
      luminances,
      bitmap.width,
      bitmap.height
    );

    const reader = new MultiFormatReader();

    const hints = new Map();

    hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      [BarcodeFormat.QR_CODE]
    );

    hints.set(
      DecodeHintType.TRY_HARDER,
      true
    );

    reader.setHints(hints);

    try {
      const binary = new BinaryBitmap(
        new HybridBinarizer(source)
      );

      const result = reader.decode(binary);

      return result.getText();
    } catch {}

    try {
      const binary = new BinaryBitmap(
        new GlobalHistogramBinarizer(source)
      );

      const result = reader.decode(binary);

      return result.getText();
    } catch {}

    return null;
  } catch {
    return null;
  }
}

function decodeJSQR(
  bitmap: {
    width: number;
    height: number;
    data: Buffer;
  }
): string | null {
  try {
    const result = jsQR(
      new Uint8ClampedArray(bitmap),
      bitmap.width,
      bitmap.height,
      {
        inversionAttempts: "attemptBoth",
      }
    );

    return result?.data ?? null;
  } catch {
    return null;
  }
}

function decodeBitmap(
  bitmap: {
    width: number;
    height: number;
    data: Buffer;
  }
): string | null {

  const zxingResult = decodeZXing(bitmap);

  if (
    zxingResult &&
    isProbablyAadhaarSecureQR(zxingResult)
  ) {
    return zxingResult.trim();
  }

  const jsqrResult = decodeJSQR(bitmap);

  if (
    jsqrResult &&
    isProbablyAadhaarSecureQR(jsqrResult)
  ) {
    return jsqrResult.trim();
  }

  return null;
}

async function tryVariants(
  image: any,
  label: string
): Promise<QRDecodeResult | null> {

  const variants: Array<{
    image: any;
    label: string;
  }> = [];

  variants.push({
    image,
    label: `${label}:original`,
  });

  variants.push({
    image: image.clone().greyscale(),
    label: `${label}:gray`,
  });

  variants.push({
    image: image
      .clone()
      .greyscale()
      .contrast(0.35)
      .normalize(),
    label: `${label}:contrast`,
  });

  for (const threshold of [100, 128, 150, 180]) {
    variants.push({
      image: image
        .clone()
        .greyscale()
        .threshold({
          max: threshold,
        }),
      label: `${label}:threshold-${threshold}`,
    });
  }

  // Upscaling is particularly useful for photographs
  // where the dense QR occupies relatively few pixels.
  variants.push({
    image: image
      .clone()
      .scale(2, Jimp.RESIZE_BICUBIC),
    label: `${label}:2x`,
  });

  for (const variant of variants) {

    const result = decodeBitmap(
      variant.image.bitmap
    );

    if (result) {
      return {
        data: result,
        width: variant.image.bitmap.width,
        height: variant.image.bitmap.height,
        method: variant.label,
      };
    }
  }

  return null;
}

function cropCandidates(image: any): any[] {

  const w = image.bitmap.width;
  const h = image.bitmap.height;

  const candidates: any[] = [];

  // Full image
  candidates.push(image.clone());

  // Large right-hand region.
  // Aadhaar QR is commonly positioned toward the
  // right side of the document.
  candidates.push(
    image.clone().crop(
      Math.floor(w * 0.35),
      0,
      Math.floor(w * 0.65),
      h
    )
  );

  // Lower-right region.
  candidates.push(
    image.clone().crop(
      Math.floor(w * 0.35),
      Math.floor(h * 0.25),
      Math.floor(w * 0.65),
      Math.floor(h * 0.75)
    )
  );

  // Lower half
  candidates.push(
    image.clone().crop(
      0,
      Math.floor(h * 0.35),
      w,
      Math.floor(h * 0.65)
    )
  );

  // Right half
  candidates.push(
    image.clone().crop(
      Math.floor(w * 0.5),
      0,
      Math.floor(w * 0.5),
      h
    )
  );

  // Four large overlapping tiles.
  const tileW = Math.floor(w * 0.60);
  const tileH = Math.floor(h * 0.60);

  const positions = [
    [0, 0],
    [Math.floor(w * 0.40), 0],
    [0, Math.floor(h * 0.40)],
    [
      Math.floor(w * 0.40),
      Math.floor(h * 0.40),
    ],
  ];

  for (const [x, y] of positions) {

    const safeX = Math.min(x, w - tileW);
    const safeY = Math.min(y, h - tileH);

    candidates.push(
      image.clone().crop(
        safeX,
        safeY,
        tileW,
        tileH
      )
    );
  }

  return candidates;
}

export async function decodeAadhaarQR(
  imageBuffer: Buffer
): Promise<QRDecodeResult | null> {

  const original = await Jimp.read(
    imageBuffer
  );

  /*
   * IMPORTANT:
   *
   * Do not aggressively resize a camera image
   * before QR detection.
   *
   * Dense Aadhaar Secure QR codes contain a lot
   * of information and therefore need sufficient
   * pixel density.
   */

  const maxDim = Math.max(
    original.bitmap.width,
    original.bitmap.height
  );

  let image = original.clone();

  if (maxDim > 5000) {

    const scale = 5000 / maxDim;

    image.resize(
      Math.round(
        original.bitmap.width * scale
      ),
      Math.round(
        original.bitmap.height * scale
      )
    );
  }

  /*
   * Stage 1:
   * Try the complete image.
   */

  let result = await tryVariants(
    image,
    "full"
  );

  if (result) {
    return result;
  }

  /*
   * Stage 2:
   * Search spatial regions.
   *
   * This is the important addition for
   * Aadhaar photographs.
   */

  const candidates =
    cropCandidates(image);

  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    result = await tryVariants(
      candidates[i],
      `crop-${i}`
    );

    if (result) {
      return result;
    }
  }

  /*
   * Stage 3:
   * Add a white quiet zone around
   * the strongest candidate regions.
   */

  for (
    let i = 0;
    i < Math.min(candidates.length, 5);
    i++
  ) {

    const candidate =
      candidates[i];

    const pad = Math.max(
      40,
      Math.round(
        Math.min(
          candidate.bitmap.width,
          candidate.bitmap.height
        ) * 0.05
      )
    );

    const padded =
      new Jimp(
        candidate.bitmap.width +
          pad * 2,
        candidate.bitmap.height +
          pad * 2,
        0xffffffff
      );

    padded.composite(
      candidate,
      pad,
      pad
    );

    result = await tryVariants(
      padded,
      `padded-${i}`
    );

    if (result) {
      return result;
    }
  }

  return null;
}
