"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import jsQR from "jsqr";

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
        } = event.data;

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
          "Client-side worker failed."
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
      "Reading Aadhaar image..."
    );

    try {
      const image =
        await createImageBitmap(
          file
        );

      const canvas =
        canvasRef.current;

      const ctx =
        canvas.getContext(
          "2d",
          {
            willReadFrequently:
              true,
          }
        );

      let width =
        image.width;

      let height =
        image.height;

      const maxDim =
        2500;

      if (
        width > maxDim ||
        height > maxDim
      ) {
        const scale =
          maxDim /
          Math.max(
            width,
            height
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
      }

      const pad =
        80;

      canvas.width =
        width +
        pad * 2;

      canvas.height =
        height +
        pad * 2;

      ctx.fillStyle =
        "#FFFFFF";

      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.drawImage(
        image,
        pad,
        pad,
        width,
        height
      );

      setProgress(20);

      setStatusText(
        "Scanning Aadhaar Secure QR..."
      );

      const imageData =
        ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );

      let result =
        jsQR(
          imageData.data,
          imageData.width,
          imageData.height,
          {
            inversionAttempts:
              "attemptBoth",
          }
        );

      if (!result) {
        setProgress(
          30
        );

        setStatusText(
          "Trying high-contrast QR scan..."
        );

        const threshold =
          new Uint8ClampedArray(
            imageData.data
              .length
          );

        for (
          let i = 0;
          i <
          imageData.data.length;
          i += 4
        ) {
          const luminance =
            0.299 *
              imageData.data[
                i
              ] +
            0.587 *
              imageData.data[
                i + 1
              ] +
            0.114 *
              imageData.data[
                i + 2
              ];

          const value =
            luminance <
            140
              ? 0
              : 255;

          threshold[
            i
          ] =
            value;

          threshold[
            i + 1
          ] =
            value;

          threshold[
            i + 2
          ] =
            value;

          threshold[
            i + 3
          ] =
            255;
        }

        result =
          jsQR(
            threshold,
            imageData.width,
            imageData.height,
            {
              inversionAttempts:
                "attemptBoth",
            }
          );
      }

      if (
        !result ||
        !result.data
      ) {
        throw new Error(
          "No Aadhaar Secure QR detected. Ensure the large QR is completely visible and in focus."
        );
      }

      setProgress(
        45
      );

      setStatusText(
        "QR decoded. Preparing local proof..."
      );

      workerRef.current?.postMessage(
        {
          qrData:
            result.data,
        }
      );
    } catch (err) {
      console.error(
        err
      );

      setError(
        err?.message ||
          "Could not read Aadhaar QR."
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
          "400px",
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
            "1rem",
        }}
      >
        Nova Client-Side Verifier
      </h3>

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
        accept="image/*"
        style={{
          display:
            "none",
        }}
        onChange={(
          e
        ) =>
          processImageFile(
            e.target
              .files?.[0]
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
        onChange={(
          e
        ) =>
          processImageFile(
            e.target
              .files?.[0]
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
              border: 0,
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
              border: 0,
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
        <div
          style={{
            textAlign:
              "center",
          }}
        >
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
                "8px",
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
                  "width 0.3s",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
