self.onmessage =
  async function (event) {
    const {
      qrData,
    } = event.data;

    try {
      if (
        typeof qrData !==
        "string"
      ) {
        throw new Error(
          "Invalid QR payload."
        );
      }

      /*
       * IMPORTANT:
       *
       * This worker currently provides the
       * execution/progress shell only.
       *
       * It does NOT claim to generate a
       * cryptographically valid Nova proof.
       *
       * Replace the proof section with the
       * actual Nova circuit/prover once your
       * Nova Aadhaar implementation is ready.
       */

      self.postMessage({
        progress:
          10,
        status:
          "Parsing Aadhaar Secure QR payload...",
      });

      await tick();

      const decimal =
        qrData.trim();

      if (
        !/^\d+$/.test(
          decimal
        )
      ) {
        throw new Error(
          "QR payload is not a valid Aadhaar Secure QR decimal payload."
        );
      }

      self.postMessage({
        progress:
          25,
        status:
          "Preparing private witness data...",
      });

      await tick();

      const digest =
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            decimal
          )
        );

      self.postMessage({
        progress:
          45,
        status:
          "Computing local integrity commitment...",
      });

      await tick();

      const commitment =
        toHex(
          new Uint8Array(
            digest
          )
        );

      self.postMessage({
        progress:
          60,
        status:
          "Preparing Nova proving inputs...",
      });

      await tick();

      /*
       * TODO:
       *
       * actual Nova prover call goes here.
       *
       * Do NOT treat `commitment` as a ZK proof.
       */

      self.postMessage({
        progress:
          100,
        status:
          "Client processing complete. Nova prover integration required.",
        success:
          false,
        error:
          "Nova prover is not connected yet. The QR processing pipeline succeeded, but no cryptographic proof was generated.",
        debugCommitment:
          commitment,
      });
    } catch (
      error
    ) {
      self.postMessage({
        success:
          false,
        error:
          error?.message ||
          "Client worker failed.",
      });
    }
  };

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
    .from(
      bytes
    )
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
