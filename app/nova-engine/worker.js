self.onmessage = async function (event) {
  const { qrData } =
    event.data;

  try {
    if (
      typeof qrData !==
      "string"
    ) {
      throw new Error(
        "Invalid Aadhaar QR payload."
      );
    }

    const normalized =
      qrData
        .replace(
          /\s+/g,
          ""
        )
        .trim();

    if (
      !/^\d+$/.test(
        normalized
      )
    ) {
      throw new Error(
        "Decoded QR is not a decimal Aadhaar Secure QR payload."
      );
    }

    if (
      normalized.length <
        300 ||
      normalized.length >
        15000
    ) {
      throw new Error(
        "Decoded Aadhaar QR payload length is outside the expected range."
      );
    }

    post(
      50,
      "QR validated. Preparing private witness..."
    );

    /*
     * IMPORTANT:
     *
     * The Aadhaar QR payload remains in this
     * browser worker.
     *
     * This SHA-256 value is NOT a Nova proof.
     * It is only a temporary integrity commitment.
     *
     * Replace this section with the actual
     * Nova Aadhaar prover.
     */
    const digest =
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          normalized
        )
      );

    const commitment =
      toHex(
        new Uint8Array(
          digest
        )
      );

    post(
      65,
      "Private proving input prepared..."
    );

    await tick();

    /*
     * =====================================================
     * ACTUAL NOVA PROVER INTEGRATION GOES HERE
     * =====================================================
     *
     * Example conceptual interface:
     *
     * const proof = await novaProver.prove({
     *   qrPayload: normalized,
     *   predicate: "age >= 18"
     * });
     *
     * The actual implementation depends on the
     * Nova Aadhaar library/circuit you choose.
     */

    post(
      80,
      "Running local proof generation..."
    );

    /*
     * Do not fake a successful proof.
     */
    throw new Error(
      "QR decoding succeeded, but the Nova Aadhaar prover is not connected to the worker yet."
    );

  } catch (
    error
  ) {
    self.postMessage({
      progress:
        0,
      success:
        false,
      error:
        error?.message ||
        "Client-side verification failed.",
    });
  }
};

function post(
  progress,
  status
) {
  self.postMessage({
    progress,
    status,
  });
}

function tick() {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        10
      )
  );
}

function toHex(
  bytes
) {
  return Array
    .from(bytes)
    .map(
      (b) =>
        b
          .toString(
            16
          )
          .padStart(
            2,
            "0"
          )
    )
    .join("");
}
