import zlib from "zlib";

export type AadhaarQRResult = {
  qrData: string;
  signedData: Buffer;
  signature: Buffer;
  fields: string[];
  birthYear: number;
  rawPayloadLength: number;
};

const MAX_QR_LENGTH =
  15000;

function normalizeQR(
  qrData: string
) {
  return qrData
    .replace(
      /\s+/g,
      ""
    )
    .trim();
}

function decimalToBytes(
  decimal: string
): Buffer {
  try {
    const value =
      BigInt(
        decimal
      );

    if (
      value <=
      0n
    ) {
      throw new Error();
    }

    let hex =
      value.toString(
        16
      );

    if (
      hex.length %
        2 !==
      0
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
  const fields: string[] =
    [];

  let start =
    0;

  for (
    let i = 0;
    i <
    signedData.length;
    i++
  ) {
    if (
      signedData[i] ===
      0xff
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
        fields.length >=
        20
      ) {
        break;
      }
    }
  }

  return fields;
}

function findBirthYear(
  fields: string[]
): number | null {
  for (
    const field of
      fields
  ) {
    const value =
      field.trim();

    const match =
      value.match(
        /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/
      );

    if (
      match
    ) {
      const year =
        Number(
          match[3]
        );

      if (
        year >=
          1900 &&
        year <=
          new Date().getFullYear()
      ) {
        return year;
      }
    }
  }

  for (
    const field of
      fields
  ) {
    const value =
      field.trim();

    if (
      /^\d{4}$/.test(
        value
      )
    ) {
      const year =
        Number(
          value
        );

      if (
        year >=
          1900 &&
        year <=
          new Date().getFullYear()
      ) {
        return year;
      }
    }
  }

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
    normalized.length <
      300 ||
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

  const decompressed =
    gunzip(
      compressed
    );

  if (
    decompressed.length <=
    256
  ) {
    throw new Error(
      "Aadhaar QR payload does not contain a valid signature."
    );
  }

  const signature =
    decompressed.subarray(
      decompressed.length -
        256
    );

  const signedData =
    decompressed.subarray(
      0,
      decompressed.length -
        256
    );

  const fields =
    splitFields(
      signedData
    );

  const birthYear =
    findBirthYear(
      fields
    );

  if (
    !birthYear
  ) {
    throw new Error(
      "Could not extract date of birth from Aadhaar Secure QR."
    );
  }

  return {
    qrData:
      normalized,
    signedData,
    signature,
    fields,
    birthYear,
    rawPayloadLength:
      decompressed.length,
  };
}

export function isAdult(
  birthYear: number,
  referenceDate = new Date()
): boolean {
  return (
    referenceDate.getFullYear() -
      birthYear >=
    18
  );
}
