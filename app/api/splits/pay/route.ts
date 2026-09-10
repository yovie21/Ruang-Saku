import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const memberId = String(body.member_id || "");
    const amount = Number(body.amount);
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    const rows = await query<{ id: string; share_amount: number; paid_amount: number }>(
      `SELECT m.id, m.share_amount, m.paid_amount FROM split_members m
       JOIN splits s ON s.id = m.split_id
       WHERE m.id = ? AND m.user_id = ? AND s.user_id = ?`,
      [memberId, userId, userId]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Anggota tidak ditemukan" }, { status: 404 });
    const m = rows[0];
    const next = Math.min(Number(m.share_amount), Number(m.paid_amount) + amount);
    await execute("UPDATE split_members SET paid_amount = ? WHERE id = ?", [next, memberId]);
    return NextResponse.json({ ok: true, paid: next });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
