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
const MAX_PIXELS = 8_000_000;
const MAX_DIMENSION = 3000;

export interface QRDetectionResult {
  payload: string;
  engine: "zxing" | "jsqr";
  width: number;
  height: number;
  attempt: string;
}

function looksLikeQRPayload(
  value: string
): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function decodeZXing(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  try {
    const source =
      new RGBLuminanceSource(
        rgba,
        width,
        height
      );

    const bitmap =
      new BinaryBitmap(
        new HybridBinarizer(
          source
        )
      );

    const reader =
      new MultiFormatReader();

    const hints =
      new Map();

    hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.QR_CODE,
      ]
    );

    /*
     * TRY_HARDER is deliberately disabled.
     * It can make serverless requests
     * extremely expensive.
     */
    hints.set(
      DecodeHintType.TRY_HARDER,
      false
    );

    reader.setHints(
      hints
    );

    const result =
      reader.decode(
        bitmap
      );

    const text =
      result.getText();

    if (
      looksLikeQRPayload(
        text
      )
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
    const result =
      jsQR(
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
      typeof result.data ===
        "string" &&
      result.data.length > 0
    ) {
      return result.data;
    }

    return null;
  } catch {
    return null;
  }
}

function decodeBitmap(
  image: Jimp,
  attempt: string
): QRDetectionResult | null {
  const width =
    image.bitmap.width;

  const height =
    image.bitmap.height;

  const rgba =
    new Uint8ClampedArray(
      image.bitmap.data
    );

  let payload =
    decodeZXing(
      rgba,
      width,
      height
    );

  if (payload) {
    return {
      payload,
      engine: "zxing",
      width,
      height,
      attempt,
    };
  }

  payload =
    decodeJsQR(
      rgba,
      width,
      height
    );

  if (payload) {
    return {
      payload,
      engine: "jsqr",
      width,
      height,
      attempt,
    };
  }

  return null;
}

function createThresholdImage(
  image: Jimp
): Jimp {
  const output =
    image.clone();

  output.scan(
    0,
    0,
    output.bitmap.width,
    output.bitmap.height,
    function (
      x,
      y,
      idx
    ) {
      const r =
        this.bitmap.data[
          idx
        ];

      const g =
        this.bitmap.data[
          idx + 1
        ];

      const b =
        this.bitmap.data[
          idx + 2
        ];

      const gray =
        Math.round(
          0.299 * r +
          0.587 * g +
          0.114 * b
        );

      const value =
        gray >= 128
          ? 255
          : 0;

      this.bitmap.data[
        idx
      ] = value;

      this.bitmap.data[
        idx + 1
      ] = value;

      this.bitmap.data[
        idx + 2
      ] = value;
    }
  );

  return output;
}

function prepareImage(
  image: Jimp
): Jimp {
  let output =
    image.clone();

  const pixels =
    output.bitmap.width *
    output.bitmap.height;

  if (
    pixels >
    MAX_PIXELS
  ) {
    const scale =
      Math.sqrt(
        MAX_PIXELS /
          pixels
      );

    output =
      output.resize(
        Math.max(
          1,
          Math.floor(
            output.bitmap.width *
              scale
          )
        ),
        Math.max(
          1,
          Math.floor(
            output.bitmap.height *
              scale
          )
        )
      );
  }

  if (
    output.bitmap.width >
      MAX_DIMENSION ||
    output.bitmap.height >
      MAX_DIMENSION
  ) {
    const scale =
      Math.min(
        MAX_DIMENSION /
          output.bitmap.width,
        MAX_DIMENSION /
          output.bitmap.height
      );

    output =
      output.resize(
        Math.max(
          1,
          Math.floor(
            output.bitmap.width *
              scale
          )
        ),
        Math.max(
          1,
          Math.floor(
            output.bitmap.height *
              scale
          )
        )
      );
  }

  return output;
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

  let original: Jimp;

  try {
    original =
      await Jimp.read(
        imageBuffer
      );
  } catch (error) {
    console.error(
      "Image read failed:",
      error
    );

    return null;
  }

  const image =
    prepareImage(
      original
    );

  /*
   * Attempt 1:
   * Original pixels.
   */
  let result =
    decodeBitmap(
      image,
      "original"
    );

  if (result) {
    return result;
  }

  /*
   * Attempt 2:
   * Grayscale.
   */
  const gray =
    image.clone()
      .greyscale();

  result =
    decodeBitmap(
      gray,
      "grayscale"
    );

  if (result) {
    return result;
  }

  /*
   * Attempt 3:
   * Contrast enhancement.
   */
  const enhanced =
    image.clone()
      .greyscale()
      .contrast(0.5);

  result =
    decodeBitmap(
      enhanced,
      "contrast"
    );

  if (result) {
    return result;
  }

  /*
   * Attempt 4:
   * Binary threshold.
   */
  const threshold =
    createThresholdImage(
      image
    );

  result =
    decodeBitmap(
      threshold,
      "threshold"
    );

  if (result) {
    return result;
  }

  /*
   * Attempt 5:
   * Enlarge once.
   */
  const enlarged =
    image.clone()
      .resize(
        Math.min(
          MAX_DIMENSION,
          image.bitmap.width *
            2
        ),
        Math.min(
          MAX_DIMENSION,
          image.bitmap.height *
            2
        )
      );

  result =
    decodeBitmap(
      enlarged,
      "enlarged"
    );

  if (result) {
    return result;
  }

  /*
   * Attempt 6:
   * Enlarged grayscale.
   */
  const enlargedGray =
    enlarged.clone()
      .greyscale();

  result =
    decodeBitmap(
      enlargedGray,
      "enlarged_grayscale"
    );

  if (result) {
    return result;
  }

  return null;
}
