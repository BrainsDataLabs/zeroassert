import zlib from "zlib";

export type AadhaarQRResult = {
  qrData: string;
  signedData: Buffer;
  signature: Buffer;
  fields: string[];
  birthDate: Date;
  birthYear: number;
  rawPayloadLength: number;
};

const MAX_QR_LENGTH = 15000;

function normalizeQR(
  qrData: string
): string {
  return qrData
    .replace(/\s+/g, "")
    .trim();
}

function decimalToBytes(
  decimal: string
): Buffer {
  try {
    const value =
      BigInt(decimal);

    if (value <= 0n) {
      throw new Error();
    }

    let hex =
      value.toString(16);

    if (
      hex.length % 2 !== 0
    ) {
      hex =
        `0${hex}`;
    }

    return Buffer.from(
      hex,
      "hex"
    );
  } catch {
    throw new Error(
      "Invalid Aadhaar QR decimal payload."
    );
  }
}

function gunzip(
  data: Buffer
): Buffer {
  try {
    return zlib.gunzipSync(
      data
    );
  } catch {
    throw new Error(
      "Aadhaar QR payload is not valid gzip data."
    );
  }
}

function splitFields(
  signedData: Buffer
): string[] {
  const fields: string[] = [];

  let start = 0;

  for (
    let i = 0;
    i < signedData.length;
    i++
  ) {
    if (
      signedData[i] === 0xff
    ) {
      fields.push(
        signedData
          .subarray(
            start,
            i
          )
          .toString(
            "latin1"
          )
      );

      start =
        i + 1;

      if (
        fields.length >= 20
      ) {
        break;
      }
    }
  }

  /*
   * Preserve the final field if the
   * payload doesn't end with 0xff.
   */
  if (
    start < signedData.length &&
    fields.length < 20
  ) {
    fields.push(
      signedData
        .subarray(start)
        .toString("latin1")
    );
  }

  return fields;
}

function parseDateString(
  value: string
): Date | null {
  const cleaned =
    value.trim();

  /*
   * Supports:
   *
   * DD-MM-YYYY
   * DD/MM/YYYY
   * DD.MM.YYYY
   */
  const match =
    cleaned.match(
      /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/
    );

  if (!match) {
    return null;
  }

  const day =
    Number(match[1]);

  const month =
    Number(match[2]);

  const year =
    Number(match[3]);

  if (
    year < 1900 ||
    year > new Date().getFullYear()
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  /*
   * Construct locally and verify the
   * resulting calendar components.
   */
  const date =
    new Date(
      year,
      month - 1,
      day
    );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !==
      month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function findBirthDate(
  fields: string[]
): Date | null {
  /*
   * First look for an explicit
   * DD-MM-YYYY style date.
   */
  for (
    const field of fields
  ) {
    const parsed =
      parseDateString(
        field
      );

    if (parsed) {
      return parsed;
    }
  }

  /*
   * Preserve compatibility with the
   * previous parser's year-only behavior.
   *
   * A year alone is NOT sufficient for
   * exact birthday-aware age verification,
   * so this deliberately returns null.
   */
  return null;
}

export function parseAadhaarSecureQR(
  qrData: string
): AadhaarQRResult {
  const normalized =
    normalizeQR(
      qrData
    );

  if (
    !/^\d+$/.test(
      normalized
    )
  ) {
    throw new Error(
      "QR is not an Aadhaar Secure QR decimal payload."
    );
  }

  if (
    normalized.length < 300 ||
    normalized.length >
      MAX_QR_LENGTH
  ) {
    throw new Error(
      "Aadhaar QR payload length is outside the expected range."
    );
  }

  const compressed =
    decimalToBytes(
      normalized
    );

  /*
   * Prevent obviously pathological
   * payloads before decompression.
   */
  if (
    compressed.length >
    12 * 1024
  ) {
    throw new Error(
      "Aadhaar QR compressed payload is unexpectedly large."
    );
  }

  const decompressed =
    gunzip(
      compressed
    );

  if (
    decompressed.length <= 256
  ) {
    throw new Error(
      "Aadhaar QR payload does not contain a valid signature."
    );
  }

  /*
   * Aadhaar Secure QR signatures are
   * expected to occupy the final 256 bytes
   * for this parser.
   */
  const signature =
    Buffer.from(
      decompressed.subarray(
        decompressed.length -
          256
      )
    );

  const signedData =
    Buffer.from(
      decompressed.subarray(
        0,
        decompressed.length -
          256
      )
    );

  if (
    signedData.length === 0
  ) {
    throw new Error(
      "Aadhaar QR signed data is empty."
    );
  }

  const fields =
    splitFields(
      signedData
    );

  const birthDate =
    findBirthDate(
      fields
    );

  if (!birthDate) {
    throw new Error(
      "Could not extract a complete date of birth from Aadhaar Secure QR."
    );
  }

  return {
    qrData:
      normalized,
    signedData,
    signature,
    fields,
    birthDate,
    birthYear:
      birthDate.getFullYear(),
    rawPayloadLength:
      decompressed.length,
  };
}

export function isAdult(
  birthDate: Date,
  referenceDate = new Date()
): boolean {
  let age =
    referenceDate.getFullYear() -
    birthDate.getFullYear();

  const birthdayHasOccurred =
    referenceDate.getMonth() >
      birthDate.getMonth() ||
    (
      referenceDate.getMonth() ===
        birthDate.getMonth() &&
      referenceDate.getDate() >=
        birthDate.getDate()
    );

  if (
    !birthdayHasOccurred
  ) {
    age -= 1;
  }

  return age >= 18;
}
