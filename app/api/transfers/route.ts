import { NextResponse } from "next/server";
import { uuid, transaction, txQuery, txExecute } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    const fromId = String(body.from_account_id || "");
    const toId = String(body.to_account_id || "");
    if (!fromId || !toId) return NextResponse.json({ error: "Akun asal dan tujuan wajib diisi" }, { status: 400 });
    if (fromId === toId) return NextResponse.json({ error: "Akun asal dan tujuan harus berbeda" }, { status: 400 });

    const result = await transaction(async (conn) => {
      // 1. Lock accounts row to prevent concurrent race condition
      const accs = await txQuery<{ id: string }>(
        conn,
        "SELECT id FROM accounts WHERE user_id = ? AND id IN (?, ?) FOR UPDATE",
        [userId, fromId, toId]
      );
      if (accs.length !== 2) throw new Error("Akun tidak ditemukan");

      // 2. Lock & check balance with FOR UPDATE
      const balRows = await txQuery<{ balance: number }>(
        conn,
        `SELECT a.opening_balance + COALESCE(SUM(
           CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
                WHEN t.type IN ('expense','transfer_out') THEN -t.amount
                WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) AS balance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.id = ? AND a.user_id = ?
         GROUP BY a.id, a.opening_balance FOR UPDATE`,
        [fromId, userId]
      );
      const fromBalance = balRows.length > 0 ? Number(balRows[0].balance) : 0;
      if (fromBalance < amount) {
        throw new Error(`Saldo akun asal tidak cukup (tersisa Rp ${Math.round(fromBalance).toLocaleString("id-ID")})`);
      }

      const groupId = uuid();
      const note = String(body.note || "Transfer antar akun").slice(0, 500);
      const date = body.transaction_date ? String(body.transaction_date).slice(0, 10) : null;

      await txExecute(
        conn,
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, transfer_group_id, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'transfer_out', ?, COALESCE(?, CURDATE()), ?, ?, NOW(), NOW())`,
        [uuid(), userId, fromId, amount, date, note, groupId]
      );
      await txExecute(
        conn,
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, transfer_group_id, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'transfer_in', ?, COALESCE(?, CURDATE()), ?, ?, NOW(), NOW())`,
        [uuid(), userId, toId, amount, date, note, groupId]
      );

      return { ok: true, transfer_group_id: groupId };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const groupId = String(body.transfer_group_id || "");
    if (!groupId) return NextResponse.json({ error: "ID transfer wajib diisi" }, { status: 400 });
    const amount = Number(body.amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    const fromId = String(body.from_account_id || "");
    const toId = String(body.to_account_id || "");
    if (!fromId || !toId) return NextResponse.json({ error: "Akun asal dan tujuan wajib diisi" }, { status: 400 });
    if (fromId === toId) return NextResponse.json({ error: "Akun asal dan tujuan harus berbeda" }, { status: 400 });

    const rawDate = body.transaction_date ? String(body.transaction_date).slice(0, 10) : null;
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: "Format tanggal tidak valid (gunakan YYYY-MM-DD)" }, { status: 400 });
    }
    const note = String(body.note ?? "Transfer antar akun").slice(0, 500);

    const result = await transaction(async (conn) => {
      const legs = await txQuery<{ id: string; type: string; account_id: string }>(
        conn,
        "SELECT id, type, account_id FROM transactions WHERE transfer_group_id = ? AND user_id = ? FOR UPDATE",
        [groupId, userId]
      );
      if (legs.length === 0) throw new Error("Transfer tidak ditemukan");
      const outLeg = legs.find(l => l.type === "transfer_out") ?? legs[0];
      const inLeg = legs.find(l => l.type === "transfer_in") ?? legs.find(l => l.id !== outLeg.id);

      const accs = await txQuery<{ id: string }>(
        conn,
        "SELECT id FROM accounts WHERE user_id = ? AND id IN (?, ?) FOR UPDATE",
        [userId, fromId, toId]
      );
      if (accs.length !== 2) throw new Error("Akun tidak ditemukan");

      // Cek saldo akun asal di luar kaki transfer_out lama agar edit tidak terkunci saldonya sendiri.
      const balRows = await txQuery<{ balance: number }>(
        conn,
        `SELECT a.opening_balance + COALESCE(SUM(
           CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
                WHEN t.type IN ('expense','transfer_out') THEN -t.amount
                WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) AS balance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id AND t.id != ?
         WHERE a.id = ? AND a.user_id = ?
         GROUP BY a.id, a.opening_balance FOR UPDATE`,
        [outLeg.id, fromId, userId]
      );
      const fromBalance = balRows.length > 0 ? Number(balRows[0].balance) : 0;
      if (fromBalance < amount) {
        throw new Error(`Saldo akun asal tidak cukup (tersisa Rp ${Math.round(fromBalance).toLocaleString("id-ID")})`);
      }

      await txExecute(
        conn,
        `UPDATE transactions SET account_id = ?, amount = ?, transaction_date = COALESCE(?, transaction_date), note = ?, updated_at = NOW()
         WHERE id = ? AND user_id = ? AND type = 'transfer_out'`,
        [fromId, amount, rawDate, note, outLeg.id, userId]
      );
      if (inLeg) {
        await txExecute(
          conn,
          `UPDATE transactions SET account_id = ?, amount = ?, transaction_date = COALESCE(?, transaction_date), note = ?, updated_at = NOW()
           WHERE id = ? AND user_id = ? AND type = 'transfer_in'`,
          [toId, amount, rawDate, note, inLeg.id, userId]
        );
      }
      return { ok: true, transfer_group_id: groupId };
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("group_id") || searchParams.get("transfer_group_id");
    if (!groupId) return NextResponse.json({ error: "ID transfer wajib diisi" }, { status: 400 });

    const result = await transaction(async (conn) => {
      const legs = await txQuery<{ id: string }>(
        conn,
        "SELECT id FROM transactions WHERE transfer_group_id = ? AND user_id = ? FOR UPDATE",
        [groupId, userId]
      );
      if (legs.length === 0) throw new Error("Transfer tidak ditemukan");
      await txExecute(
        conn,
        "DELETE FROM transactions WHERE transfer_group_id = ? AND user_id = ?",
        [groupId, userId]
      );
      return { ok: true, deleted: legs.length };
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
