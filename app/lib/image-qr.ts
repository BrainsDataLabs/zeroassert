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

function decodeZXing(
  bitmap: { width: number; height: number; data: Buffer }
): string | null {
  const { width, height, data } = bitmap;
  const len = width * height;

  const luminances = new Uint8ClampedArray(len);

  for (let i = 0; i < len; i++) {
    const o = i * 4;

    luminances[i] =
      ((data[o] * 77 +
        data[o + 1] * 150 +
        data[o + 2] * 29) >>
        8);
  }

  const source = new RGBLuminanceSource(
    luminances,
    width,
    height
  );

  const reader = new MultiFormatReader();

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  reader.setHints(hints);

  try {
    const bitmap = new BinaryBitmap(
      new HybridBinarizer(source)
    );

    return reader.decode(bitmap).getText();
  } catch {}

  try {
    const bitmap = new BinaryBitmap(
      new GlobalHistogramBinarizer(source)
    );

    return reader.decode(bitmap).getText();
  } catch {}

  return null;
}

function decodeJSQR(
  bitmap: { width: number; height: number; data: Buffer }
): string | null {
  try {
    const result = jsQR(
      new Uint8ClampedArray(bitmap.data),
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

function isProbablyAadhaarSecureQR(data: string): boolean {
  const s = data.trim();

  // Secure Aadhaar QR is a large decimal payload.
  // Do NOT accept arbitrary XML/text QR payloads here.
  return (
    /^\d+$/.test(s) &&
    s.length >= 300 &&
    s.length <= 15000
  );
}

async function tryImage(
  image: any,
  methodPrefix: string
): Promise<QRDecodeResult | null> {
  const attempts: Array<{
    bitmap: any;
    method: string;
  }> = [
    {
      bitmap: image.bitmap,
      method: `${methodPrefix}:zxing-hybrid`,
    },
  ];

  for (const attempt of attempts) {
    const result = decodeZXing(attempt.bitmap);

    if (result && isProbablyAadhaarSecureQR(result)) {
      return {
        data: result.trim(),
        width: attempt.bitmap.width,
        height: attempt.bitmap.height,
        method: attempt.method,
      };
    }

    const jsResult = decodeJSQR(attempt.bitmap);

    if (jsResult && isProbablyAadhaarSecureQR(jsResult)) {
      return {
        data: jsResult.trim(),
        width: attempt.bitmap.width,
        height: attempt.bitmap.height,
        method: `${methodPrefix}:jsqr`,
      };
    }
  }

  return null;
}

export async function decodeAadhaarQR(
  imageBuffer: Buffer
): Promise<QRDecodeResult | null> {
  const original = await Jimp.read(imageBuffer);

  // Preserve more resolution than the old 2400px global resize.
  const image = original.clone();

  const maxDim = Math.max(
    image.bitmap.width,
    image.bitmap.height
  );

  if (maxDim > 4000) {
    const scale = 4000 / maxDim;

    image.resize(
      Math.round(image.bitmap.width * scale),
      Math.round(image.bitmap.height * scale)
    );
  }

  // Pass 1: original image
  let result = await tryImage(image, "original");

  if (result) return result;

  // Pass 2: grayscale
  const gray = image.clone().greyscale();

  result = await tryImage(gray, "grayscale");

  if (result) return result;

  // Pass 3: contrast enhancement
  const enhanced = image
    .clone()
    .greyscale()
    .contrast(0.35)
    .normalize();

  result = await tryImage(enhanced, "enhanced");

  if (result) return result;

  // Pass 4: threshold
  const thresholded = image
    .clone()
    .greyscale()
    .threshold({
      max: 150,
    });

  result = await tryImage(thresholded, "threshold");

  if (result) return result;

  // Pass 5: 2x upscale
  const scaled = image
    .clone()
    .scale(2, Jimp.RESIZE_BICUBIC);

  result = await tryImage(scaled, "2x");

  if (result) return result;

  // Pass 6: add a proper quiet zone.
  const pad = 80;

  const padded = new Jimp(
    image.bitmap.width + pad * 2,
    image.bitmap.height + pad * 2,
    0xffffffff
  );

  padded.composite(image, pad, pad);

  result = await tryImage(padded, "padded");

  if (result) return result;

  // Pass 7: rotated image.
  for (const angle of [90, 180, 270]) {
    const rotated = image.clone().rotate(angle);

    result = await tryImage(
      rotated,
      `rotated-${angle}`
    );

    if (result) return result;
  }

  return null;
}
