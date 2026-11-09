"use client";

import { useCallback, useState } from "react";
import NovaScanner from "./nova-engine/NovaScanner";

type Mode = "ephemeral" | "nova";

export default function AgeVerificationGateway() {
  const [mode, setMode] = useState<Mode>("ephemeral");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  async function handleEphemeralUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    setError("");
    setVerified(false);
    setLoading(true);
    setProgress(5);
    setStatusMessage("Preparing secure ephemeral session...");

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select a PNG, JPG or WebP image.");
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Image exceeds the 10 MB limit.");
      }

      const formData = new FormData();
      formData.append("file", file);

      setProgress(20);
      setStatusMessage("Uploading document for temporary processing...");

      /*
       * IMPORTANT:
       *
       * Use the current ZeroAssert origin explicitly.
       * This prevents accidental requests to another host when
       * the application is deployed behind a custom domain.
       *
       * Production:
       * https://zeroassert.brainsdata.org/api/verify-ephemeral
       */
      const apiUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/verify-ephemeral`
          : "/api/verify-ephemeral";

      console.log("[ZeroAssert] API URL:", apiUrl);

      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      setProgress(70);
      setStatusMessage("Securely validating Aadhaar QR...");

      /*
       * DO NOT blindly call response.json().
       *
       * If Vercel/Next.js/custom-domain routing returns an HTML
       * error page, response.json() produces:
       *
       * Unexpected token '<', "<!DOCTYPE "... is not valid JSON
       *
       * Read the response as text first and then parse JSON.
       */
      const responseText = await response.text();

      const contentType =
        response.headers.get("content-type") || "";

      console.log("[ZeroAssert] HTTP status:", response.status);
      console.log(
        "[ZeroAssert] Content-Type:",
        contentType
      );

      if (!response.ok) {
        let message = `Verification request failed (${response.status}).`;

        if (contentType.includes("application/json")) {
          try {
            const errorData = JSON.parse(responseText);

            message =
              errorData?.error ||
              errorData?.message ||
              message;
          } catch {
            // Keep the generic HTTP error.
          }
        } else {
          console.error(
            "[ZeroAssert] Non-JSON server response:",
            responseText.slice(0, 1000)
          );

          if (
            responseText.includes("<!DOCTYPE") ||
            responseText.includes("<html")
          ) {
            message =
              `ZeroAssert API returned an HTML page instead of JSON (HTTP ${response.status}). ` +
              `Check the deployment/routing of /api/verify-ephemeral.`;
          }
        }

        throw new Error(message);
      }

      if (!contentType.includes("application/json")) {
        console.error(
          "[ZeroAssert] Expected JSON but received:",
          responseText.slice(0, 1000)
        );

        throw new Error(
          "ZeroAssert API returned HTML instead of JSON. " +
          "The API route is not being reached by the zeroassert.brainsdata.org deployment."
        );
      }

      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(
          "[ZeroAssert] Invalid JSON returned by API:",
          responseText.slice(0, 1000)
        );

        throw new Error(
          "ZeroAssert API returned malformed JSON."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Aadhaar verification failed."
        );
      }

      setProgress(100);
      setVerified(true);
      setStatusMessage(
        "Age verified. Checkout unlocked."
      );
    } catch (err: any) {
      console.error(
        "[ZeroAssert] Verification error:",
        err
      );

      setError(
        err?.message ||
          "Verification failed."
      );

      setProgress(0);
      setStatusMessage("");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  const handleNovaVerified = useCallback(
    (proof: any) => {
      console.log(
        "Nova proof received:",
        proof
      );

      setVerified(true);

      setStatusMessage(
        "Client-side proof generated and verified."
      );
    },
    []
  );

  function reset() {
    setVerified(false);
    setError("");
    setStatusMessage("");
    setProgress(0);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    reset();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F9FAFB",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "#FFFFFF",
          borderRadius: "16px",
          boxShadow:
            "0 10px 30px rgba(0,0,0,0.06)",
          padding: "2rem",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            textAlign: "center",
            marginBottom: "1.5rem",
          }}
        >
          Age Verification Gateway
        </h1>

        <div
          style={{
            display: "flex",
            background: "#F3F4F6",
            borderRadius: "10px",
            padding: "4px",
            marginBottom: "1.5rem",
          }}
        >
          <button
            type="button"
            onClick={() =>
              switchMode("ephemeral")
            }
            style={{
              flex: 1,
              padding: "0.7rem 0.5rem",
              border: 0,
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              background:
                mode === "ephemeral"
                  ? "#2563EB"
                  : "transparent",
              color:
                mode === "ephemeral"
                  ? "#FFFFFF"
                  : "#4B5563",
            }}
          >
            Server Ephemeral Path
          </button>

          <button
            type="button"
            onClick={() =>
              switchMode("nova")
            }
            style={{
              flex: 1,
              padding: "0.7rem 0.5rem",
              border: 0,
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              background:
                mode === "nova"
                  ? "#2563EB"
                  : "transparent",
              color:
                mode === "nova"
                  ? "#FFFFFF"
                  : "#4B5563",
            }}
          >
            Client Nova ZKP 🛡️
          </button>
        </div>

        {verified ? (
          <div
            style={{
              padding: "1.5rem",
              background: "#ECFDF5",
              border:
                "1px solid #A7F3D0",
              borderRadius: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "2rem",
              }}
            >
              ✅
            </div>

            <h3
              style={{
                color: "#065F46",
              }}
            >
              Age Verified — 18+
            </h3>

            <p
              style={{
                fontSize: "0.85rem",
                color: "#047857",
              }}
            >
              {statusMessage}
            </p>

            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "1rem",
                padding: "0.65rem 1rem",
                border: 0,
                borderRadius: "8px",
                background: "#065F46",
                color: "#FFFFFF",
              }}
            >
              Verify another document
            </button>
          </div>
        ) : mode === "nova" ? (
          <NovaScanner
            onVerified={
              handleNovaVerified
            }
          />
        ) : (
          <div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#4B5563",
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              Your Aadhaar image is processed
              temporarily for verification and
              is not returned to the merchant.
            </p>

            {error && (
              <div
                style={{
                  background: "#FEF2F2",
                  border:
                    "1px solid #FECACA",
                  color: "#B91C1C",
                  padding: "0.9rem",
                  borderRadius: "8px",
                  marginBottom: "1.25rem",
                  wordBreak: "break-word",
                }}
              >
                {error}
              </div>
            )}

            <label
              style={{
                display: "block",
                width: "100%",
                padding: "1.6rem 1rem",
                border:
                  "2px dashed #D1D5DB",
                borderRadius: "12px",
                textAlign: "center",
                cursor
