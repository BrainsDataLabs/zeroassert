import Jimp from "jimp";
import jsQR from "jsqr";
import {
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 5_000_000;
const MAX_DIMENSION = 2400;

export interface QRDetectionResult {
  payload: string;
  engine: "zxing" | "jsqr";
  width: number;
  height: number;
}

function decodeZXing(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  try {
    const source = new RGBLuminanceSource(
      rgba,
      width,
      height
    );

    const bitmap = new BinaryBitmap(
      new HybridBinarizer(source)
    );

    const reader = new MultiFormatReader();

    const hints = new Map();

    hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      [BarcodeFormat.QR_CODE]
    );

    // Important:
    // Do NOT enable TRY_HARDER here.
    // It can become extremely expensive on arbitrary images.
    hints.set(
      DecodeHintType.TRY_HARDER,
      false
    );

    reader.setHints(hints);

    const result = reader.decode(bitmap);

    const text = result.getText();

    if (
      typeof text === "string" &&
      text.length > 0
    ) {
      return text;
    }

    return null;
  } catch {
    return null;
  }
}

function decodeJsQR(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  try {
    const result = jsQR(
      rgba,
      width,
      height,
      {
        inversionAttempts:
          "attemptBoth",
      }
    );

    if (
      result &&
      typeof result.data === "string" &&
      result.data.length > 0
    ) {
      return result.data;
    }

    return null;
  } catch {
    return null;
  }
}

function tryBoth(
  image: Jimp
): QRDetectionResult | null {
  const width =
    image.bitmap.width;

  const height =
    image.bitmap.height;

  const rgba =
    new Uint8ClampedArray(
      image.bitmap.data
    );

  const zxing =
    decodeZXing(
      rgba,
      width,
      height
    );

  if (zxing) {
    return {
      payload: zxing,
      engine: "zxing",
      width,
      height,
    };
  }

  const jsqr =
    decodeJsQR(
      rgba,
      width,
      height
    );

  if (jsqr) {
    return {
      payload: jsqr,
      engine: "jsqr",
      width,
      height,
    };
  }

  return null;
}

export async function decodeAadhaarQR(
  imageBuffer: Buffer
): Promise<QRDetectionResult | null> {
  if (
    !imageBuffer ||
    imageBuffer.length === 0
  ) {
    return null;
  }

  if (
    imageBuffer.length >
    MAX_FILE_BYTES
  ) {
    return null;
  }

  let image: Jimp;

  try {
    image =
      await Jimp.read(
        imageBuffer
      );
  } catch (error) {
    console.error(
      "Jimp read failed:",
      error
    );

    return null;
  }

  let width =
    image.bitmap.width;

  let height =
    image.bitmap.height;

  if (
    !width ||
    !height
  ) {
    return null;
  }

  const pixels =
    width * height;

  // Prevent pathological images from
  // consuming excessive memory/CPU.
  if (
    pixels >
    MAX_PIXELS
  ) {
    const scale =
      Math.sqrt(
        MAX_PIXELS /
          pixels
      );

    width =
      Math.max(
        1,
        Math.floor(
          width * scale
        )
      );

    height =
      Math.max(
        1,
        Math.floor(
          height * scale
        )
      );

    image =
      image
        .clone()
        .resize(
          width,
          height
        );
  }

  // Hard dimension cap.
  if (
    image.bitmap.width >
      MAX_DIMENSION ||
    image.bitmap.height >
      MAX_DIMENSION
  ) {
    const scale =
      Math.min(
        MAX_DIMENSION /
          image.bitmap.width,
        MAX_DIMENSION /
          image.bitmap.height
      );

    const newWidth =
      Math.max(
        1,
        Math.floor(
          image.bitmap.width *
            scale
        )
      );

    const newHeight =
      Math.max(
        1,
        Math.floor(
          image.bitmap.height *
            scale
        )
      );

    image =
      image
        .clone()
        .resize(
          newWidth,
          newHeight
        );
  }

  // ---------------------------------------------------------
  // Attempt 1: original image
  // ---------------------------------------------------------
  let result =
    tryBoth(image);

  if (result) {
    return result;
  }

  // ---------------------------------------------------------
  // Attempt 2: grayscale
  // ---------------------------------------------------------
  const grayscale =
    image.clone().greyscale();

  result =
    tryBoth(grayscale);

  if (result) {
    return result;
  }

  // ---------------------------------------------------------
  // Attempt 3: controlled enlargement
  // ---------------------------------------------------------
  const enlargedWidth =
    Math.min(
      MAX_DIMENSION,
      image.bitmap.width * 2
    );

  const enlargedHeight =
    Math.min(
      MAX_DIMENSION,
      image.bitmap.height * 2
    );

  if (
    enlargedWidth >
      image.bitmap.width ||
    enlargedHeight >
      image.bitmap.height
  ) {
    const enlarged =
      image
        .clone()
        .resize(
          enlargedWidth,
          enlargedHeight
        );

    result =
      tryBoth(
        enlarged
      );

    if (result) {
      return result;
    }
  }

  return null;
}
