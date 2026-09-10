import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUser();
    const rows = await query<{
      id: string; name: string; account_type: string;
      account_number_last4: string | null; currency: string;
      opening_balance: number; current_balance: number; is_archived: number;
    }>(
      `SELECT a.id, a.name, a.account_type, a.account_number_last4, a.currency, a.opening_balance,
               a.opening_balance + COALESCE((SELECT SUM(
                CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
                     WHEN t.type IN ('expense','transfer_out') THEN -t.amount
                     WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END)
                FROM transactions t WHERE t.account_id = a.id), 0) AS current_balance,
              a.is_archived
       FROM accounts a WHERE a.user_id = ? AND a.is_archived = 0
       ORDER BY a.created_at`,
      [userId]
    );
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const id = uuid();
    // 4 digit terakhir opsional: string kosong / undefined dinormalisasi jadi NULL
    // agar tampilan tidak menyimpan "" yang terlihat seperti masih terisi.
    const last4raw = body.account_number_last4 !== undefined && body.account_number_last4 !== null
      ? String(body.account_number_last4).replace(/\D/g, "").slice(-4)
      : "";
    const last4 = last4raw ? last4raw : null;
    await execute(
      `INSERT INTO accounts (id, user_id, name, account_type, institution_name, account_number_last4, currency, opening_balance, opening_balance_date, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'IDR', ?, CURDATE(), 0, NOW(), NOW())`,
      [id, userId, body.name, body.account_type ?? "bank", body.institution_name ?? null, last4, Number(body.opening_balance) || 0]
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const name = body.name !== undefined ? String(body.name).trim().slice(0, 100) : undefined;
    if (name !== undefined && !name) return NextResponse.json({ error: "Nama akun wajib diisi" }, { status: 400 });
    const allowedTypes = ["bank", "ewallet", "cash", "credit_card", "investment"];
    const accountType = body.account_type !== undefined ? String(body.account_type) : undefined;
    if (accountType !== undefined && !allowedTypes.includes(accountType)) {
      return NextResponse.json({ error: "Jenis akun tidak valid" }, { status: 400 });
    }
    // Opsional: "", null, atau undefined semuanya dinormalisasi konsisten.
    const last4raw = body.account_number_last4 !== undefined && body.account_number_last4 !== null
      ? String(body.account_number_last4).replace(/\D/g, "").slice(-4)
      : "";
    const last4 = body.account_number_last4 === undefined ? undefined : (last4raw ? last4raw : null);
    const openingBalance = body.opening_balance !== undefined && body.opening_balance !== null && body.opening_balance !== ""
      ? Number(String(body.opening_balance).replace(/[^0-9-]/g, ""))
      : undefined;
    if (openingBalance !== undefined && Number.isNaN(openingBalance)) {
      return NextResponse.json({ error: "Saldo awal tidak valid" }, { status: 400 });
    }
    const sets: string[] = ["updated_at = NOW()"];
    const params: (string | number | null)[] = [];
    if (name !== undefined) { sets.push("name = ?"); params.push(name); }
    if (accountType !== undefined) { sets.push("account_type = ?"); params.push(accountType); }
    if (last4 !== undefined) { sets.push("account_number_last4 = ?"); params.push(last4); }
    if (openingBalance !== undefined) { sets.push("opening_balance = ?"); params.push(openingBalance); }
    if (sets.length === 1) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
    params.push(id, userId);
    const res = await execute(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
    if (res.affectedRows === 0) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const owned = await query<{ id: string }>("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [id, userId]);
    if (owned.length === 0) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
    const used = await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND user_id = ?",
      [id, userId]
    );
    if (Number(used[0]?.n ?? 0) > 0) {
      await execute("UPDATE accounts SET is_archived = 1, updated_at = NOW() WHERE id = ? AND user_id = ?", [id, userId]);
      return NextResponse.json({ ok: true, archived: true });
    }
    await execute("DELETE FROM accounts WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
