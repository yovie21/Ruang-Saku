import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

async function accountBalance(userId: string, accountId: string, excludeTxId?: string): Promise<number | null> {
  // Urutan params HARUS mengikuti urutan placeholder di SQL:
  // JOIN ... t.id != ? (bila ada), lalu WHERE a.id = ?, a.user_id = ?.
  const params: (string | number | null)[] = [];
  let exclude = "";
  if (excludeTxId) {
    exclude = "AND t.id != ?";
    params.push(excludeTxId);
  }
  params.push(accountId, userId);
  const rows = await query<{ balance: number }>(
    `SELECT a.opening_balance + COALESCE(SUM(
       CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
            WHEN t.type IN ('expense','transfer_out') THEN -t.amount
            WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) AS balance
     FROM accounts a
     LEFT JOIN transactions t ON t.account_id = a.id ${exclude}
     WHERE a.id = ? AND a.user_id = ?
     GROUP BY a.id, a.opening_balance`,
    params
  );
  return rows.length > 0 ? Number(rows[0].balance) : null;
}

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    let sql = `SELECT t.id, t.note AS title, t.type, t.amount, t.transaction_date, t.note, t.transfer_group_id,
                      t.account_id, t.category_id, t.receipt_name,
                      (t.receipt_data IS NOT NULL) AS has_receipt,
                      c.name AS category, a.name AS account
               FROM transactions t
               LEFT JOIN categories c ON c.id = t.category_id
               LEFT JOIN accounts a ON a.id = t.account_id
               WHERE t.user_id = ?`;
    const params: (string | number | null)[] = [userId];
    if (type && type !== "all") {
      sql += " AND t.type = ?";
      params.push(type);
    }
    sql += " ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 500";
    const rows = await query(sql, params);
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    const type = String(body.type || "expense");
    const accountId = body.account_id ? String(body.account_id) : null;
    if (!accountId) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });
    if (type === "expense") {
      const balance = await accountBalance(userId, accountId);
      if (balance === null) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });
      if (balance < amount) return NextResponse.json({ error: `Saldo tidak cukup (tersisa Rp ${Math.round(balance).toLocaleString("id-ID")})` }, { status: 400 });
    }
    const id = uuid();
    const categoryRows = body.category
      ? await query<{ id: string }>("SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?", [userId, body.category, body.type])
      : [];
    const categoryId = categoryRows.length > 0 ? categoryRows[0].id : null;
    // Hormati tanggal bila dikirim (format YYYY-MM-DD), default hari ini.
    const rawDate = body.transaction_date ? String(body.transaction_date).slice(0, 10) : null;
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: "Format tanggal tidak valid (gunakan YYYY-MM-DD)" }, { status: 400 });
    }
    await execute(
      `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, NOW(), NOW())`,
      [id, userId, body.account_id, categoryId, body.type, amount, rawDate, body.title ?? null]
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

    // Ambil data lama agar PUT parsial: field yang tidak dikirim dipertahankan.
    // Ini membuat "ubah tanggal saja" tidak wajib mengirim account_id yang valid.
    const existing = await query<{ account_id: string | null; category_id: string | null; type: string; amount: number }>(
      "SELECT account_id, category_id, type, amount FROM transactions WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    if (existing.length === 0) return NextResponse.json({ error: "Transaksi tidak ditemukan", code: "PUT_TX_NOT_FOUND" }, { status: 404 });

    const amount = body.amount !== undefined && body.amount !== null && body.amount !== ""
      ? Number(body.amount)
      : Number(existing[0].amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0", code: "PUT_BAD_AMOUNT" }, { status: 400 });
    const type = String(body.type || existing[0].type || "expense");
    if (type !== "income" && type !== "expense") return NextResponse.json({ error: `Tipe tidak valid: ${type}`, code: "PUT_BAD_TYPE" }, { status: 400 });

    let accountId: string | null = body.account_id ? String(body.account_id) : null;
    if (!accountId && body.account) {
      // Tanpa filter is_archived agar kompatibel dengan DB lama yang belum punya kolom itu.
      // Ambil 1 baris terbaru bila nama duplikat.
      const accRows = await query<{ id: string }>("SELECT id FROM accounts WHERE user_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1", [userId, String(body.account)]);
      accountId = accRows.length > 0 ? accRows[0].id : null;
    }
    // Parsial: pertahankan akun lama bila payload tidak membawa akun baru.
    if (!accountId) accountId = existing[0].account_id;
    if (!accountId) return NextResponse.json({ error: "Akun wajib dipilih", code: "PUT_NO_ACCOUNT" }, { status: 400 });

    // Bedakan pesan: id dikirim tapi tidak ada di DB (basi/milik user lain/dihapus).
    const ownerRows = await query<{ id: string }>("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
    if (ownerRows.length === 0) return NextResponse.json({ error: "Akun tidak ditemukan (akun mungkin sudah dihapus atau diarsip)", code: "PUT_ACCOUNT_NOT_OWNED", accountId }, { status: 400 });

    let categoryId: string | null = body.category_id ? String(body.category_id) : null;
    if (!categoryId && body.category) {
      const catRows = await query<{ id: string }>("SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?", [userId, String(body.category), type]);
      categoryId = catRows.length > 0 ? catRows[0].id : null;
    }
    if (!categoryId) categoryId = existing[0].category_id;

    const rawDate = body.transaction_date ? String(body.transaction_date).slice(0, 10) : null;
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: "Format tanggal tidak valid (gunakan YYYY-MM-DD)", code: "PUT_BAD_DATE" }, { status: 400 });
    }
    const date = rawDate ?? null;

    if (type === "expense") {
      let balance: number | null;
      try {
        balance = await accountBalance(userId, accountId, id);
      } catch (e) {
        // Jangan samarkan error SQL sebagai "akun tidak ditemukan".
        console.error("PUT /api/transactions accountBalance failed:", e);
        return NextResponse.json({ error: `Gagal cek saldo: ${(e as Error).message}`, code: "PUT_BALANCE_QUERY_FAILED" }, { status: 500 });
      }
      if (balance === null) return NextResponse.json({ error: "Akun tidak ditemukan saat cek saldo", code: "PUT_BALANCE_NULL", accountId }, { status: 400 });
      if (balance < amount) return NextResponse.json({ error: `Saldo tidak cukup (tersisa Rp ${Math.round(balance).toLocaleString("id-ID")})`, code: "PUT_INSUFFICIENT" }, { status: 400 });
    }

    const result = await execute(
      `UPDATE transactions SET account_id = ?, category_id = ?, type = ?, amount = ?,
        transaction_date = COALESCE(?, transaction_date), note = COALESCE(?, note), updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [accountId, categoryId, type, amount, date, body.title ?? null, id, userId]
    );
    if (result.affectedRows === 0) return NextResponse.json({ error: "Transaksi tidak ditemukan", code: "PUT_NO_ROWS_UPDATED", id }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/transactions failed:", e);
    return NextResponse.json({ error: (e as Error).message, code: "PUT_EXCEPTION" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const rows = await query<{ transfer_group_id: string | null }>(
      "SELECT transfer_group_id FROM transactions WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    const groupId = rows.length > 0 ? rows[0].transfer_group_id : null;
    if (groupId) {
      await execute("DELETE FROM transactions WHERE transfer_group_id = ? AND user_id = ?", [groupId, userId]);
    } else {
      await execute("DELETE FROM transactions WHERE id = ? AND user_id = ?", [id, userId]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
