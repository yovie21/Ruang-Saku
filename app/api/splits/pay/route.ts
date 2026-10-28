import { NextResponse } from "next/server";
import { query, execute, transaction, txQuery, txExecute } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const memberId = String(body.member_id || "");
    const amount = Number(body.amount);
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    
    // C3 FIX: Wrap check + update dalam transaction untuk atomic payment
    await transaction(async (conn) => {
      const rows = await txQuery<{ id: string; share_amount: number; paid_amount: number; budget_limit: number | null }>(
        conn,
        `SELECT m.id, m.share_amount, m.paid_amount, s.budget_limit FROM split_members m
         JOIN splits s ON s.id = m.split_id
         WHERE m.id = ? AND m.user_id = ? AND s.user_id = ?
         FOR UPDATE`,
        [memberId, userId, userId]
      );
      
      if (rows.length === 0) throw new Error("Anggota tidak ditemukan");
      const m = rows[0];
      
      const next = Math.min(Number(m.share_amount), Number(m.paid_amount) + amount);
      
      // Budget check: total paid tidak boleh exceed budget_limit
      if (m.budget_limit && next > m.budget_limit) {
        throw new Error(`Budget limit Rp${m.budget_limit.toLocaleString("id-ID")} exceeded`);
      }
      
      const result = await txExecute(
        conn,
        "UPDATE split_members SET paid_amount = ? WHERE id = ?",
        [next, memberId]
      );
      
      if (result.affectedRows === 0) throw new Error("Update failed");
    });
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Budget limit") || msg === "Anggota tidak ditemukan") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("POST /api/splits/pay failed:", e);
    return NextResponse.json({ error: "Gagal proses pembayaran" }, { status: 400 });
  }
}
