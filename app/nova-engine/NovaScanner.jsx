"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import jsQR from "jsqr";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/browser";

function isAadhaarSecureQR(data) {
  if (typeof data !== "string") return false;

  const normalized = data
    .replace(/\s+/g, "")
    .trim();

  return (
    /^\d+$/.test(normalized) &&
    normalized.length >= 300 &&
    normalized.length <= 15000
  );
}

function normalizeQR(data) {
  return String(data || "")
    .replace(/\s+/g, "")
    .trim();
}

function getCanvasContext(canvas) {
  return canvas.getContext("2d", {
    willReadFrequently: true,
  });
}

function drawImageCover(
  ctx,
  image,
  width,
  height
) {
  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  const scale = Math.min(
    width / image.width,
    height / image.height
  );

  const drawW =
    image.width * scale;

  const drawH =
    image.height * scale;

  const x =
    (width - drawW) / 2;

  const y =
    (height - drawH) / 2;

  ctx.drawImage(
    image,
    x,
    y,
    drawW,
    drawH
  );
}

function makeImageVariants(
  sourceCanvas
) {
  const variants = [];

  const width =
    sourceCanvas.width;

  const height =
    sourceCanvas.height;

  // Full image.
  variants.push({
    canvas: sourceCanvas,
    name: "full",
  });

  // Overlapping tiles.
  //
  // This is important for phone photos:
  // the Aadhaar QR may only occupy 20-35%
  // of the entire image.
  const tileSizes = [
    0.55,
    0.70,
    0.85,
  ];

  for (
    const fraction of tileSizes
  ) {
    const tileW =
      Math.floor(
        width * fraction
      );

    const tileH =
      Math.floor(
        height * fraction
      );

    const stepX =
      Math.max(
        1,
        Math.floor(
          (width - tileW) /
            2
        )
      );

    const stepY =
      Math.max(
        1,
        Math.floor(
          (height - tileH) /
            2
        )
      );

    const positions = [
      [0, 0],
      [
        width - tileW,
        0,
      ],
      [
        0,
        height - tileH,
      ],
      [
        width - tileW,
        height - tileH,
      ],
      [
        stepX,
        stepY,
      ],
    ];

    positions.forEach(
      ([x, y], index) => {
        const tile =
          document.createElement(
            "canvas"
          );

        tile.width =
          tileW;

        tile.height =
          tileH;

        const tctx =
          getCanvasContext(
            tile
          );

        tctx.drawImage(
          sourceCanvas,
          x,
          y,
          tileW,
          tileH,
          0,
          0,
          tileW,
          tileH
        );

        variants.push({
          canvas: tile,
          name:
            `tile-${fraction}-${index}`,
        });
      }
    );
  }

  return variants;
}

function preprocessCanvas(
  input,
  mode
) {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    input.width;

  canvas.height =
    input.height;

  const ctx =
    getCanvasContext(
      canvas
    );

  ctx.drawImage(
    input,
    0,
    0
  );

  if (mode === "original") {
    return canvas;
  }

  const imageData =
    ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

  const data =
    imageData.data;

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {
    let value =
      0.299 *
        data[i] +
      0.587 *
        data[i + 1] +
      0.114 *
        data[i + 2];

    if (
      mode === "contrast"
    ) {
      value =
        (value - 128) *
          1.8 +
        128;
    }

    if (
      mode === "threshold"
    ) {
      value =
        value < 160
          ? 0
          : 255;
    }

    value =
      Math.max(
        0,
        Math.min(
          255,
          value
        )
      );

    data[i] =
      value;
    data[i + 1] =
      value;
    data[i + 2] =
      value;
    data[i + 3] =
      255;
  }

  ctx.putImageData(
    imageData,
    0,
    0
  );

  return canvas;
}

function decodeWithJsQR(
  canvas
) {
  try {
    const ctx =
      getCanvasContext(
        canvas
      );

    const imageData =
      ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

    const result =
      jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        {
          inversionAttempts:
            "attemptBoth",
        }
      );

    if (
      result?.data &&
      isAadhaarSecureQR(
        result.data
      )
    ) {
      return normalizeQR(
        result.data
      );
    }
  } catch {}

  return null;
}

async function decodeWithZXing(
  canvas
) {
  try {
    const reader =
      new BrowserMultiFormatReader();

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

    reader.hints =
      hints;

    const result =
      await reader.decodeFromCanvas(
        canvas
      );

    const text =
      result?.getText?.();

    if (
      text &&
      isAadhaarSecureQR(
        text
      )
    ) {
      return normalizeQR(
        text
      );
    }
  } catch {}

  return null;
}

async function findAadhaarQR(
  sourceCanvas,
  setProgress,
  setStatus
) {
  const variants =
    makeImageVariants(
      sourceCanvas
    );

  const modes = [
    "original",
    "contrast",
    "threshold",
  ];

  const total =
    variants.length *
    modes.length;

  let completed = 0;

  for (
    const variant of variants
  ) {
    for (
      const mode of modes
    ) {
      completed++;

      const percent =
        Math.min(
          42,
          15 +
            Math.floor(
              (completed /
                total) *
                27
            )
        );

      setProgress(
        percent
      );

      setStatus(
        `Searching Aadhaar QR... ${percent}%`
      );

      const processed =
        preprocessCanvas(
          variant.canvas,
          mode
        );

      /*
       * ZXing first.
       */
      const zxing =
        await decodeWithZXing(
          processed
        );

      if (zxing) {
        return zxing;
      }

      /*
       * jsQR fallback.
       */
      const jsqr =
        decodeWithJsQR(
          processed
        );

      if (jsqr) {
        return jsqr;
      }
    }
  }

  return null;
}

export default function NovaScanner({
  onVerified,
}) {
  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    progress,
    setProgress,
  ] = useState(0);

  const [
    statusText,
    setStatusText,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const workerRef =
    useRef(null);

  const fileInputRef =
    useRef(null);

  const cameraInputRef =
    useRef(null);

  const canvasRef =
    useRef(null);

  useEffect(() => {
    const worker =
      new Worker(
        new URL(
          "./worker.js",
          import.meta.url
        ),
        {
          type: "module",
        }
      );

    workerRef.current =
      worker;

    worker.onmessage =
      (event) => {
        const {
          progress,
          status,
          success,
          proof,
          error,
        } =
          event.data;

        if (
          typeof progress ===
          "number"
        ) {
          setProgress(
            progress
          );
        }

        if (status) {
          setStatusText(
            status
          );
        }

        if (success) {
          setLoading(
            false
          );

          setStatusText(
            "Proof generated successfully."
          );

          onVerified(
            proof
          );
        }

        if (error) {
          setError(
            error
          );

          setLoading(
            false
          );
        }
      };

    worker.onerror =
      (event) => {
        console.error(
          event
        );

        setError(
          "Client-side proving worker failed."
        );

        setLoading(
          false
        );
      };

    return () => {
      worker.terminate();

      workerRef.current =
        null;
    };
  }, [onVerified]);

  async function processImageFile(
    file
  ) {
    if (!file) {
      return;
    }

    setError("");
    setLoading(true);
    setProgress(5);

    setStatusText(
      "Loading Aadhaar image..."
    );

    try {
      const image =
        await createImageBitmap(
          file
        );

      const canvas =
        canvasRef.current;

      /*
       * Keep enough resolution for the dense
       * Aadhaar Secure QR but avoid exploding
       * browser memory.
       */
      const MAX_DIM =
        3200;

      let width =
        image.width;

      let height =
        image.height;

      const scale =
        Math.min(
          1,
          MAX_DIM /
            Math.max(
              width,
              height
            )
        );

      width =
        Math.round(
          width *
            scale
        );

      height =
        Math.round(
          height *
            scale
        );

      canvas.width =
        width;

      canvas.height =
        height;

      const ctx =
        getCanvasContext(
          canvas
        );

      drawImageCover(
        ctx,
        image,
        width,
        height
      );

      image.close?.();

      setProgress(
        10
      );

      setStatusText(
        "Searching the complete Aadhaar image..."
      );

      const qrData =
        await findAadhaarQR(
          canvas,
          setProgress,
          setStatusText
        );

      if (!qrData) {
        throw new Error(
          "Aadhaar Secure QR could not be detected. Try a sharper image with the complete large QR and all four finder corners visible."
        );
      }

      setProgress(
        45
      );

      setStatusText(
        "Aadhaar QR decoded. Preparing local proof..."
      );

      workerRef.current?.postMessage(
        {
          qrData,
        }
      );
    } catch (err) {
      console.error(
        err
      );

      setError(
        err?.message ||
          "Could not process Aadhaar image."
      );

      setLoading(
        false
      );
    }
  }

  return (
    <div
      style={{
        maxWidth:
          "420px",
        margin:
          "0 auto",
        padding:
          "1.25rem",
        background:
          "#FFFFFF",
        borderRadius:
          "12px",
        boxShadow:
          "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <h3
        style={{
          textAlign:
            "center",
          marginBottom:
            "0.6rem",
        }}
      >
        Nova Client-Side Verifier
      </h3>

      <p
        style={{
          fontSize:
            "0.78rem",
          color:
            "#6B7280",
          textAlign:
            "center",
          marginBottom:
            "1rem",
        }}
      >
        Aadhaar QR processing remains
        on this device.
      </p>

      {error && (
        <div
          style={{
            background:
              "#FEF2F2",
            color:
              "#B91C1C",
            padding:
              "0.8rem",
            borderRadius:
              "8px",
            fontSize:
              "0.82rem",
            marginBottom:
              "1rem",
          }}
        >
          {error}
        </div>
      )}

      <canvas
        ref={
          canvasRef
        }
        style={{
          display:
            "none",
        }}
      />

      <input
        ref={
          fileInputRef
        }
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{
          display:
            "none",
        }}
        onChange={(e) =>
          processImageFile(
            e.target.files?.[0]
          )
        }
      />

      <input
        ref={
          cameraInputRef
        }
        type="file"
        accept="image/*"
        capture="environment"
        style={{
          display:
            "none",
        }}
        onChange={(e) =>
          processImageFile(
            e.target.files?.[0]
          )
        }
      />

      {!loading ? (
        <div
          style={{
            display:
              "flex",
            flexDirection:
              "column",
            gap:
              "0.75rem",
          }}
        >
          <button
            onClick={() =>
              cameraInputRef.current?.click()
            }
            style={{
              width:
                "100%",
              background:
                "#2563EB",
              color:
                "#FFFFFF",
              padding:
                "0.85rem",
              border:
                0,
              borderRadius:
                "8px",
              fontWeight:
                600,
            }}
          >
            📷 Scan Aadhaar with Camera
          </button>

          <button
            onClick={() =>
              fileInputRef.current?.click()
            }
            style={{
              width:
                "100%",
              background:
                "#4B5563",
              color:
                "#FFFFFF",
              padding:
                "0.85rem",
              border:
                0,
              borderRadius:
                "8px",
              fontWeight:
                600,
            }}
          >
            📁 Upload Aadhaar Image
          </button>
        </div>
      ) : (
        <div>
          <div
            style={{
              padding:
                "0.9rem",
              background:
                "#F3F4F6",
              borderRadius:
                "8px",
              marginBottom:
                "1rem",
              textAlign:
                "center",
            }}
          >
            {statusText}
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              fontSize:
                "0.8rem",
              marginBottom:
                "0.4rem",
            }}
          >
            <span>
              Progress
            </span>

            <span>
              {progress}%
            </span>
          </div>

          <div
            style={{
              height:
                "10px",
              background:
                "#E5E7EB",
              borderRadius:
                "999px",
              overflow:
                "hidden",
            }}
          >
            <div
              style={{
                width:
                  `${progress}%`,
                height:
                  "100%",
                background:
                  "#2563EB",
                transition:
                  "width 0.2s",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
