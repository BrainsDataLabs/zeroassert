"use client";

import { useState } from "react";
import NovaScanner from "./nova-engine/NovaScanner";

export default function AgeVerificationGateway() {
  const [mode, setMode] =
    useState<"ephemeral" | "nova">("ephemeral");

  const [loading, setLoading] =
    useState(false);

  const [statusMessage, setStatusMessage] =
    useState("");

  const [verified, setVerified] =
    useState(false);

  const [error, setError] =
    useState("");

  const [progress, setProgress] =
    useState(0);

  async function handleEphemeralUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    setError("");
    setVerified(false);
    setLoading(true);
    setProgress(10);

    try {
      setStatusMessage(
        "Preparing secure ephemeral session..."
      );

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      setProgress(25);

      setStatusMessage(
        "Uploading document for temporary processing..."
      );

      const response =
        await fetch(
          "/api/verify-ephemeral",
          {
            method: "POST",
            body: formData,
            cache: "no-store",
          }
        );

      setProgress(70);

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Verification failed."
        );
      }

      setProgress(100);

      setVerified(true);

      setStatusMessage(
        "Age verified. Checkout unlocked."
      );
    } catch (err: any) {
      setError(
        err?.message ||
          "Verification failed."
      );

      setProgress(0);
    } finally {
      setLoading(false);

      /*
       * Clear the input value so the same image
       * can be selected again after failure.
       */
      e.target.value = "";
    }
  }

  function handleNovaVerified(
    proof: any
  ) {
    setVerified(true);

    setStatusMessage(
      "Client-side proof generated and verified."
    );
  }

  function reset() {
    setVerified(false);
    setError("");
    setStatusMessage("");
    setProgress(0);
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
            color: "#111827",
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
            onClick={() => {
              setMode("ephemeral");
              reset();
            }}
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
            onClick={() => {
              setMode("nova");
              reset();
            }}
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
                marginBottom: "0.5rem",
              }}
            >
              ✅
            </div>

            <h3
              style={{
                color: "#065F46",
                marginBottom: "0.5rem",
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
              onClick={reset}
              style={{
                marginTop: "1rem",
                padding:
                  "0.65rem 1rem",
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
                marginBottom: "1.25rem",
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
                  fontSize: "0.82rem",
                  marginBottom: "1.25rem",
                }}
              >
                {error}
              </div>
            )}

            <label
              style={{
                display: "block",
                width: "100%",
                padding:
                  "1.6rem 1rem",
                border:
                  "2px dashed #D1D5DB",
                borderRadius: "12px",
                textAlign: "center",
                cursor:
                  loading
                    ? "not-allowed"
                    : "pointer",
                background: "#F9FAFB",
                boxSizing:
                  "border-box",
              }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={
                  handleEphemeralUpload
                }
                disabled={loading}
                style={{
                  display: "none",
                }}
              />

              <span
                style={{
                  display: "block",
                  fontSize: "1.8rem",
                  marginBottom:
                    "0.5rem",
                }}
              >
                📄
              </span>

              <span
                style={{
                  display: "block",
                  fontWeight: 600,
                  color: "#1F2937",
                }}
              >
                {loading
                  ? "Processing securely..."
                  : "Choose Aadhaar Image"}
              </span>

              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "#6B7280",
                  marginTop:
                    "0.3rem",
                }}
              >
                PNG, JPG or WebP ·
                Maximum 10 MB
              </span>
            </label>

            {loading && (
              <div
                style={{
                  marginTop: "1.25rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    fontSize:
                      "0.8rem",
                    color:
                      "#4B5563",
                    marginBottom:
                      "0.4rem",
                  }}
                >
                  <span>
                    {statusMessage}
                  </span>

                  <span>
                    {progress}%
                  </span>
                </div>

                <div
                  style={{
                    width: "100%",
                    height: "8px",
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
                        "width 0.25s ease",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
