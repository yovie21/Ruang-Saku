import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { requireUser } from "@/lib/session";

const MAX_BYTES = 1_500_000; // ~1.5MB base64
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUser();
    const rows = await query<{ receipt_data: string | null; receipt_mime: string | null; receipt_name: string | null }>(
      "SELECT receipt_data, receipt_mime, receipt_name FROM transactions WHERE id = ? AND user_id = ?",
      [params.id, userId]
    );
    if (rows.length === 0 || !rows[0].receipt_data) return NextResponse.json({ error: "Struk tidak ditemukan" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const data: string = String(body.data || "");
    const mime: string = String(body.mime || "");
    const name: string = String(body.name || "struk").slice(0, 255);
    if (!data) return NextResponse.json({ error: "File belum dipilih" }, { status: 400 });
    if (!ALLOWED.includes(mime)) return NextResponse.json({ error: "Format harus JPG/PNG/WebP/PDF" }, { status: 400 });
    if (data.length > MAX_BYTES * 1.4) return NextResponse.json({ error: "Ukuran maksimal ±1MB" }, { status: 400 });
    const res = await execute(
      "UPDATE transactions SET receipt_data = ?, receipt_name = ?, receipt_mime = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
      [data, name, mime, params.id, userId]
    );
    if (res.affectedRows === 0) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUser();
    await execute(
      "UPDATE transactions SET receipt_data = NULL, receipt_name = NULL, receipt_mime = NULL WHERE id = ? AND user_id = ?",
      [params.id, userId]
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
