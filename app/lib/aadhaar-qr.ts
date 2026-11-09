import zlib from "zlib";

export interface ParsedAadhaarQR {
  signedData: Buffer;
  signature: Buffer;
  birthDate?: Date;
  birthYear?: number;
}

/**
 * Convert the decimal QR payload into raw bytes.
 */
function decimalStringToBuffer(
  value: string
): Buffer {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      "QR payload is not decimal."
    );
  }

  const number = BigInt(normalized);

  let hex = number.toString(16);

  if (hex.length % 2 !== 0) {
    hex = "0" + hex;
  }

  return Buffer.from(
    hex,
    "hex"
  );
}

/**
 * Try to extract a plausible DOB from decoded
 * Secure QR fields.
 */
function findBirthDate(
  data: Buffer
): Date | undefined {
  const text = data
    .toString("utf8")
    .replace(/\0/g, " ");

  /*
   * Look for common date representations:
   *
   * DD-MM-YYYY
   * DD/MM/YYYY
   * DD.MM.YYYY
   *
   * This is deliberately conservative.
   */
  const dateRegex =
    /(?:^|[^0-9])(\d{2})[-/.](\d{2})[-/.](\d{4})(?:[^0-9]|$)/g;

  let match: RegExpExecArray | null;

  while (
    (match = dateRegex.exec(text)) !== null
  ) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    if (
      year < 1900 ||
      year > new Date().getFullYear()
    ) {
      continue;
    }

    if (
      month < 1 ||
      month > 12
    ) {
      continue;
    }

    if (
      day < 1 ||
      day > 31
    ) {
      continue;
    }

    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

    // Reject impossible dates such as 31/02/2000.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      continue;
    }

    return date;
  }

  return undefined;
}

/**
 * Parse the currently expected Aadhaar Secure QR
 * representation.
 *
 * The current implementation assumes:
 *
 * decimal QR payload
 *        ↓
 * big-endian byte representation
 *        ↓
 * gzip-compressed payload
 *        ↓
 * final 256 bytes = RSA signature
 *        ↓
 * preceding bytes = signed data
 *
 * This assumption must be validated against the exact
 * Secure QR format used by the Aadhaar QR being supplied.
 */
export function parseAadhaarSecureQR(
  qrData: string
): ParsedAadhaarQR | null {
  try {
    const value = qrData.trim();

    if (!/^\d+$/.test(value)) {
      return null;
    }

    if (
      value.length < 300 ||
      value.length > 15000
    ) {
      return null;
    }

    const raw = decimalStringToBuffer(
      value
    );

    if (raw.length < 257) {
      return null;
    }

    let decompressed: Buffer;

    try {
      decompressed =
        zlib.gunzipSync(raw);
    } catch {
      /*
       * Some representations may contain
       * leading bytes before the gzip stream.
       *
       * Search for the gzip magic header,
       * but keep this bounded.
       */
      const gzipOffset =
        findGzipHeader(raw);

      if (gzipOffset < 0) {
        return null;
      }

      try {
        decompressed =
          zlib.gunzipSync(
            raw.subarray(gzipOffset)
          );
      } catch {
        return null;
      }
    }

    if (decompressed.length < 257) {
      return null;
    }

    /*
     * Current implementation expects a
     * 256-byte RSA signature at the end.
     */
    const signature =
      decompressed.subarray(
        decompressed.length - 256
      );

    const signedData =
      decompressed.subarray(
        0,
        decompressed.length - 256
      );

    if (
      signedData.length === 0 ||
      signature.length !== 256
    ) {
      return null;
    }

    const birthDate =
      findBirthDate(
        signedData
      );

    /*
     * We require an actual DOB rather than
     * guessing adulthood from unrelated data.
     */
    if (!birthDate) {
      return null;
    }

    return {
      signedData,
      signature,
      birthDate,
      birthYear:
        birthDate.getUTCFullYear(),
    };
  } catch (error) {
    console.error(
      "Aadhaar Secure QR parsing failed:",
      error
    );

    return null;
  }
}

/**
 * Locate gzip magic bytes:
 *
 * 1F 8B
 */
function findGzipHeader(
  buffer: Buffer
): number {
  const maxSearch =
    Math.min(
      buffer.length - 1,
      4096
    );

  for (
    let i = 0;
    i < maxSearch;
    i++
  ) {
    if (
      buffer[i] === 0x1f &&
      buffer[i + 1] === 0x8b
    ) {
      return i;
    }
  }

  return -1;
}

/**
 * Birthday-aware 18+ calculation.
 *
 * Accepts either:
 *   - Date
 *   - birth year
 */
export function isAdult(
  birthDateOrYear:
    | Date
    | number
): boolean {
  const today =
    new Date();

  if (
    birthDateOrYear instanceof Date
  ) {
    const dob =
      new Date(
        birthDateOrYear
      );

    let age =
      today.getFullYear() -
      dob.getUTCFullYear();

    const birthdayThisYear =
      new Date(
        today.getFullYear(),
        dob.getUTCMonth(),
        dob.getUTCDate()
      );

    if (
      today < birthdayThisYear
    ) {
      age--;
    }

    return age >= 18;
  }

  const year =
    Number(birthDateOrYear);

  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > today.getFullYear()
  ) {
    return false;
  }

  return (
    today.getFullYear() -
    year >= 18
  );
}
