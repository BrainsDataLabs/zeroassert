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

function normalizeQR(
  data: string
): string {
  return data
    .replace(/\s+/g, "")
    .trim();
}

function isProbablyAadhaarSecureQR(
  data: string
): boolean {
  const normalized =
    normalizeQR(data);

  return (
    /^\d+$/.test(normalized) &&
    normalized.length >= 300 &&
    normalized.length <= 15000
  );
}

function decodeZXing(
  bitmap: {
    width: number;
    height: number;
    data: Buffer;
  }
): string | null {
  const {
    width,
    height,
    data,
  } = bitmap;

  const pixelCount =
    width * height;

  if (
    pixelCount <= 0 ||
    pixelCount > 20_000_000
  ) {
    return null;
  }

  const luminances =
    new Uint8ClampedArray(
      pixelCount
    );

  for (
    let i = 0;
    i < pixelCount;
    i++
  ) {
    const offset =
      i * 4;

    luminances[i] =
      (
        data[offset] * 77 +
        data[offset + 1] * 150 +
        data[offset + 2] * 29
      ) >> 8;
  }

  const source =
    new RGBLuminanceSource(
      luminances,
      width,
      height
    );

  const reader =
    new MultiFormatReader();

  const hints =
    new Map();

  hints.set(
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.QR_CODE]
  );

  hints.set(
    DecodeHintType.TRY_HARDER,
    true
  );

  reader.setHints(
    hints
  );

  try {
    const result =
      reader.decode(
        new BinaryBitmap(
          new HybridBinarizer(
            source
          )
        )
      );

    return result.getText();
  } catch {
    // Try the alternate binarizer.
  }

  try {
    const result =
      reader.decode(
        new BinaryBitmap(
          new GlobalHistogramBinarizer(
            source
          )
        )
      );

    return result.getText();
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
    const result =
      jsQR(
        new Uint8ClampedArray(
          bitmap.data
        ),
        bitmap.width,
        bitmap.height,
        {
          inversionAttempts:
            "attemptBoth",
        }
      );

    return (
      result?.data ||
      null
    );
  } catch {
    return null;
  }
}

async function tryBitmap(
  bitmap: any,
  method: string
): Promise<QRDecodeResult | null> {
  const zxing =
    decodeZXing(
      bitmap
    );

  if (
    zxing &&
    isProbablyAadhaarSecureQR(
      zxing
    )
  ) {
    return {
      data:
        normalizeQR(
          zxing
        ),
      width:
        bitmap.width,
      height:
        bitmap.height,
      method:
        `${method}:zxing`,
    };
  }

  const jsqr =
    decodeJSQR(
      bitmap
    );

  if (
    jsqr &&
    isProbablyAadhaarSecureQR(
      jsqr
    )
  ) {
    return {
      data:
        normalizeQR(
          jsqr
        ),
      width:
        bitmap.width,
      height:
        bitmap.height,
      method:
        `${method}:jsqr`,
    };
  }

  return null;
}

async function tryImage(
  image: any,
  prefix: string
): Promise<QRDecodeResult | null> {
  let result =
    await tryBitmap(
      image.bitmap,
      `${prefix}:original`
    );

  if (result) {
    return result;
  }

  /*
   * These fallback transformations are
   * deliberately done only after the
   * original image fails.
   */

  const gray =
    image
      .clone()
      .greyscale();

  result =
    await tryBitmap(
      gray.bitmap,
      `${prefix}:gray`
    );

  if (result) {
    return result;
  }

  const enhanced =
    image
      .clone()
      .greyscale()
      .contrast(0.5)
      .normalize();

  result =
    await tryBitmap(
      enhanced.bitmap,
      `${prefix}:enhanced`
    );

  if (result) {
    return result;
  }

  const thresholded =
    image
      .clone()
      .greyscale()
      .threshold({
        max: 160,
      });

  result =
    await tryBitmap(
      thresholded.bitmap,
      `${prefix}:threshold`
    );

  if (result) {
    return result;
  }

  return null;
}

function makePadded(
  image: any,
  pad = 120
) {
  const padded =
    new Jimp(
      image.bitmap.width +
        pad * 2,
      image.bitmap.height +
        pad * 2,
      0xffffffff
    );

  padded.composite(
    image,
    pad,
    pad
  );

  return padded;
}

export async function decodeAadhaarQR(
  imageBuffer: Buffer
): Promise<QRDecodeResult | null> {
  if (
    !imageBuffer ||
    imageBuffer.length === 0
  ) {
    return null;
  }

  /*
   * Jimp is intentionally initialized
   * inside the function so module loading
   * problems are caught by the API route.
   */
  let original: any;

  try {
    original =
      await Jimp.read(
        imageBuffer
      );
  } catch (error: any) {
    throw new Error(
      `Image decoder could not read the uploaded image: ${
        error?.message ||
        "unknown Jimp error"
      }`
    );
  }

  const image =
    original.clone();

  const maxDim =
    Math.max(
      image.bitmap.width,
      image.bitmap.height
    );

  /*
   * Keep the image bounded so a huge
   * camera image cannot create enormous
   * intermediate buffers.
   */
  if (
    maxDim > 3000
  ) {
    const scale =
      3000 /
      maxDim;

    image.resize(
      Math.max(
        1,
        Math.round(
          image.bitmap.width *
            scale
        )
      ),
      Math.max(
        1,
        Math.round(
          image.bitmap.height *
            scale
        )
      )
    );
  }

  /*
   * PASS 1
   * Whole image.
   */
  let result =
    await tryImage(
      image,
      "full"
    );

  if (result) {
    return result;
  }

  /*
   * PASS 2
   *
   * Search a few likely QR regions.
   *
   * This is intentionally less aggressive
   * than the original implementation to
   * reduce serverless memory/CPU usage.
   */
  const fractions = [
    0.55,
    0.70,
    0.85,
  ];

  for (
    const fraction of
      fractions
  ) {
    const tileW =
      Math.floor(
        image.bitmap.width *
          fraction
      );

    const tileH =
      Math.floor(
        image.bitmap.height *
          fraction
      );

    const xs = [
      0,
      Math.max(
        0,
        image.bitmap.width -
          tileW
      ),
      Math.floor(
        (
          image.bitmap.width -
            tileW
        ) / 2
      ),
    ];

    const ys = [
      0,
      Math.max(
        0,
        image.bitmap.height -
          tileH
      ),
      Math.floor(
        (
          image.bitmap.height -
            tileH
        ) / 2
      ),
    ];

    for (
      const x of xs
    ) {
      for (
        const y of ys
      ) {
        const tile =
          image.clone();

        tile.crop(
          x,
          y,
          tileW,
          tileH
        );

        result =
          await tryImage(
            tile,
            `tile-${fraction}-${x}-${y}`
          );

        if (result) {
          return result;
        }

        /*
         * One enlargement fallback.
         */
        const enlarged =
          tile
            .clone()
            .scale(
              2,
              Jimp.RESIZE_BICUBIC
            );

        result =
          await tryImage(
            enlarged,
            `tile2x-${fraction}-${x}-${y}`
          );

        if (result) {
          return result;
        }
      }
    }
  }

  /*
   * PASS 3
   *
   * Add a QR quiet zone.
   */
  const padded =
    makePadded(
      image,
      120
    );

  result =
    await tryImage(
      padded,
      "padded"
    );

  if (result) {
    return result;
  }

  /*
   * PASS 4
   *
   * Rotation fallback.
   */
  for (
    const angle of [
      90,
      180,
      270,
    ]
  ) {
    const rotated =
      image
        .clone()
        .rotate(
          angle
        );

    result =
      await tryImage(
        rotated,
        `rotated-${angle}`
      );

    if (result) {
      return result;
    }
  }

  return null;
}
