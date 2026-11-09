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
) {
  return data
    .replace(
      /\s+/g,
      ""
    )
    .trim();
}

function isProbablyAadhaarSecureQR(
  data: string
): boolean {
  const s =
    normalizeQR(
      data
    );

  return (
    /^\d+$/.test(
      s
    ) &&
    s.length >= 300 &&
    s.length <= 15000
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

  const len =
    width *
    height;

  const luminances =
    new Uint8ClampedArray(
      len
    );

  for (
    let i = 0;
    i < len;
    i++
  ) {
    const o =
      i * 4;

    luminances[
      i
    ] =
      ((
        data[o] *
          77 +
        data[o + 1] *
          150 +
        data[o + 2] *
          29
      ) >>
        8);
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
    [
      BarcodeFormat.QR_CODE,
    ]
  );

  hints.set(
    DecodeHintType.TRY_HARDER,
    true
  );

  reader.setHints(
    hints
  );

  try {
    return reader
      .decode(
        new BinaryBitmap(
          new HybridBinarizer(
            source
          )
        )
      )
      .getText();
  } catch {}

  try {
    return reader
      .decode(
        new BinaryBitmap(
          new GlobalHistogramBinarizer(
            source
          )
        )
      )
      .getText();
  } catch {}

  return null;
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
      result?.data ??
      null
    );
  } catch {
    return null;
  }
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

async function tryBitmap(
  bitmap: any,
  method: string
) {
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
) {
  let result =
    await tryBitmap(
      image.bitmap,
      `${prefix}:original`
    );

  if (result)
    return result;

  const gray =
    image
      .clone()
      .greyscale();

  result =
    await tryBitmap(
      gray.bitmap,
      `${prefix}:gray`
    );

  if (result)
    return result;

  const enhanced =
    image
      .clone()
      .greyscale()
      .contrast(
        0.5
      )
      .normalize();

  result =
    await tryBitmap(
      enhanced.bitmap,
      `${prefix}:enhanced`
    );

  if (result)
    return result;

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

  if (result)
    return result;

  return null;
}

export async function decodeAadhaarQR(
  imageBuffer: Buffer
): Promise<QRDecodeResult | null> {
  const original =
    await Jimp.read(
      imageBuffer
    );

  const image =
    original.clone();

  const maxDim =
    Math.max(
      image.bitmap.width,
      image.bitmap.height
    );

  if (
    maxDim >
    4000
  ) {
    const scale =
      4000 /
      maxDim;

    image.resize(
      Math.round(
        image.bitmap.width *
          scale
      ),
      Math.round(
        image.bitmap.height *
          scale
      )
    );
  }

  /*
   * Pass 1: whole image.
   */
  let result =
    await tryImage(
      image,
      "full"
    );

  if (result)
    return result;

  /*
   * Pass 2: tiled image search.
   *
   * This handles photographs where the QR
   * occupies only a portion of the Aadhaar.
   */
  const fractions =
    [
      0.55,
      0.70,
      0.85,
    ];

  for (
    const fraction
      of fractions
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

    const xs =
      [
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
          ) /
            2
        ),
      ];

    const ys =
      [
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
          ) /
            2
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

        if (result)
          return result;

        /*
         * Dense Aadhaar QR often benefits
         * significantly from enlargement.
         */
        const enlarged =
          tile.clone().scale(
            2,
            Jimp.RESIZE_BICUBIC
          );

        result =
          await tryImage(
            enlarged,
            `tile2x-${fraction}-${x}-${y}`
          );

        if (result)
          return result;
      }
    }
  }

  /*
   * Pass 3: add QR quiet zone.
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

  if (result)
    return result;

  /*
   * Pass 4: rotation fallback.
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

    if (result)
      return result;
  }

  return null;
}
