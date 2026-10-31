import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { query, execute } from "@/lib/db";
import { randomBytes } from "crypto";

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const rows = await query<{ webhook_token: string | null }>(
      "SELECT webhook_token FROM users WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    let token = rows[0].webhook_token;
    if (!token) {
      token = "rs_" + randomBytes(16).toString("hex");
      await execute("UPDATE users SET webhook_token = ? WHERE id = ?", [token, userId]);
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ruangsakuapp.vercel.app";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const webhookUrl = `${proto}://${host}/api/webhooks/bank?token=${token}`;

    return NextResponse.json({
      success: true,
      token,
      webhookUrl
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Sesi habis, silakan login ulang." }, { status: 401 });
    }
    console.error("[Webhook Token GET]", error);
    return NextResponse.json({ error: "Gagal mengambil token webhook" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const newToken = "rs_" + randomBytes(16).toString("hex");
    await execute("UPDATE users SET webhook_token = ? WHERE id = ?", [newToken, userId]);

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ruangsakuapp.vercel.app";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const webhookUrl = `${proto}://${host}/api/webhooks/bank?token=${newToken}`;

    return NextResponse.json({
      success: true,
      token: newToken,
      webhookUrl,
      message: "Token webhook berhasil diperbarui."
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Sesi habis, silakan login ulang." }, { status: 401 });
    }
    console.error("[Webhook Token POST]", error);
    return NextResponse.json({ error: "Gagal memperbarui token webhook" }, { status: 500 });
  }
}
