"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function ErrorPage({ error }: { error: Error & { code?: string } }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "Callback") {
      console.error("[NextAuth Callback Error]", error.message);
    }
  }, [error, searchParams]);

  return (
    <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Terjadi Kesalahan</h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          Proses masuk gagal. Ini biasanya karena konfigurasi OAuth yang belum benar.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          style={{
            padding: "12px 24px",
            backgroundColor: "#fff",
            border: "1px solid #ccc",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "1rem"
          }}
        >
          Coba Lagi
        </button>
      </div>
    </main>
  );
}
