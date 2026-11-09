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
const MAX_DIMENSION = 2200;
const MAX_PIXELS = 4_500_000;

/**
 * Aadhaar Secure QR data is normally represented as a long
 * numeric payload. This filter prevents us from accepting
 * arbitrary QR content as Aadhaar data.
 *
 * NOTE:
 * This is only a cheap first-stage filter. The actual
 * cryptographic verification happens later.
 */
function isPotentialAadhaarQR(data: string): boolean {
  const value = data.trim();

  if (!/^\d+$/.test(value)) {
    return false;
  }

  return value.length >= 300 && value.length <= 15000;
}

/**
 * Attempt decoding with ZXing.
 */
function decodeWithZXing(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  try {
    const luminanceSource = new RGBLuminanceSource(
      rgba,
      width,
      height
    );

    const bitmap = new BinaryBitmap(
      new HybridBinarizer(luminanceSource)
    );

    const reader = new MultiFormatReader();

    const hints = new Map();

    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
    ]);

    hints.set(DecodeHintType.TRY_HARDER, false);

    reader.setHints(hints);

    const result = reader.decode(bitmap);

    const text = result.getText();

    return isPotentialAadhaarQR(text)
      ? text.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * Attempt decoding with jsQR.
 */
function decodeWithJsQR(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  try {
    const result = jsQR(rgba, width, height, {
      inversionAttempts: "dontInvert",
    });

    if (!result?.data) {
      return null;
    }

    const text = result.data.trim();

    return isPotentialAadhaarQR(text)
      ? text
      : null;
  } catch {
    return null;
  }
}

/**
 * Try both QR engines against one image.
 */
function tryDecode(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  // ZXing first
  const zxingResult = decodeWithZXing(
    rgba,
    width,
    height
  );

  if (zxingResult) {
    return zxingResult;
  }

  // jsQR fallback
  return decodeWithJsQR(
    rgba,
    width,
    height
  );
}

/**
 * Create a grayscale RGBA buffer.
 */
function grayscaleRGBA(
  rgba: Uint8ClampedArray
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(rgba.length);

  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];

    // Standard luminance approximation.
    const gray =
      Math.round(
        0.299 * r +
        0.587 * g +
        0.114 * b
      );

    output[i] = gray;
    output[i + 1] = gray;
    output[i + 2] = gray;
    output[i + 3] = rgba[i + 3];
  }

  return output;
}

/**
 * Decode a Jimp image using a small, deterministic number
 * of attempts.
 */
async function decodeJimpImage(
  image: Jimp
): Promise<string | null> {
  const rgba = new Uint8ClampedArray(
    image.bitmap.data
  );

  const width = image.bitmap.width;
  const height = image.bitmap.height;

  // Attempt 1: original image
  let result = tryDecode(
    rgba,
    width,
    height
  );

  if (result) {
    return result;
  }

  // Attempt 2: grayscale
  const gray = grayscaleRGBA(rgba);

  result = tryDecode(
    gray,
    width,
    height
  );

  if (result) {
    return result;
  }

  return null;
}

/**
 * Main QR decoder.
 *
 * Important performance rule:
 * We deliberately do NOT scan dozens of tiles or rotations.
 * A serverless function should fail fast on arbitrary images.
 */
export async function decodeAadhaarQR(
  imageBuffer: Buffer
): Promise<string | null> {
  if (!imageBuffer || imageBuffer.length === 0) {
    return null;
  }

  if (imageBuffer.length > MAX_FILE_BYTES) {
    return null;
  }

  let image: Jimp;

  try {
    image = await Jimp.read(imageBuffer);
  } catch (error) {
    console.error("Jimp image read failed:", error);
    return null;
  }

  let width = image.bitmap.width;
  let height = image.bitmap.height;

  if (!width || !height) {
    return null;
  }

  const pixelCount = width * height;

  if (pixelCount > MAX_PIXELS) {
    const scale = Math.sqrt(
      MAX_PIXELS / pixelCount
    );

    width = Math.max(
      1,
      Math.floor(width * scale)
    );

    height = Math.max(
      1,
      Math.floor(height * scale)
    );

    image = image.clone().resize(
      width,
      height
    );
  }

  // Hard dimension bound.
  if (
    image.bitmap.width > MAX_DIMENSION ||
    image.bitmap.height > MAX_DIMENSION
  ) {
    const scale = Math.min(
      MAX_DIMENSION / image.bitmap.width,
      MAX_DIMENSION / image.bitmap.height
    );

    const newWidth = Math.max(
      1,
      Math.floor(
        image.bitmap.width * scale
      )
    );

    const newHeight = Math.max(
      1,
      Math.floor(
        image.bitmap.height * scale
      )
    );

    image = image.clone().resize(
      newWidth,
      newHeight
    );
  }

  // Main bounded decode.
  let result = await decodeJimpImage(image);

  if (result) {
    return result;
  }

  /*
   * One controlled enlargement fallback.
   *
   * This helps when the QR occupies a relatively small
   * portion of the supplied image without introducing the
   * huge tile/rotation search used previously.
   */
  const currentWidth =
    image.bitmap.width;

  const currentHeight =
    image.bitmap.height;

  const enlargedWidth = Math.min(
    MAX_DIMENSION,
    currentWidth * 2
  );

  const enlargedHeight = Math.min(
    MAX_DIMENSION,
    currentHeight * 2
  );

  if (
    enlargedWidth > currentWidth ||
    enlargedHeight > currentHeight
  ) {
    const enlarged = image
      .clone()
      .resize(
        enlargedWidth,
        enlargedHeight
      );

    result = await decodeJimpImage(
      enlarged
    );

    if (result) {
      return result;
    }
  }

  return null;
}
