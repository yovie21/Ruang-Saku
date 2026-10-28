import { NextResponse } from "next/server";
import { query, execute, uuid, transaction, txQuery, txExecute } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { apiLimiter } from "@/lib/ratelimit";

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
    
    // R1: Rate limit GET
    const { allowed } = apiLimiter(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak request" },
        { status: 429, headers: { "retry-after": "60" } }
      );
    }
    
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
    console.error("GET /api/transactions failed:", e);
    return NextResponse.json({ error: "Gagal ambil transaksi" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    
    // Rate limit: 30 requests per minute per user
    const { allowed, remaining } = apiLimiter(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak request. Coba lagi dalam beberapa saat." },
        { status: 429, headers: { "retry-after": "60" } }
      );
    }
    
    const body = await req.json();
    
    // L2: Strict type check (not coercion)
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
      return NextResponse.json({ error: "Nominal harus angka valid" }, { status: 400 });
    }
    const amount = body.amount;
    if (amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    
    // C1: Case-insensitive & normalized type
    const type = String(body.type || "expense").toLowerCase();
    if (type !== "income" && type !== "expense") {
      return NextResponse.json({ error: "Tipe harus 'income' atau 'expense'" }, { status: 400 });
    }
    
    const accountId = body.account_id ? String(body.account_id) : null;
    if (!accountId) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });
    
    const categoryRows = body.category
      ? await query<{ id: string }>("SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?", [userId, body.category, type])
      : [];
    const categoryId = categoryRows.length > 0 ? categoryRows[0].id : null;
    
    // H1: Sanitize title/note (strip HTML tags, max 255 chars)
    const title = body.title ? String(body.title).slice(0, 255).replace(/<[^>]*>/g, "") : null;
    
    const rawDate = body.transaction_date ? String(body.transaction_date).slice(0, 10) : null;
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: "Format tanggal tidak valid (gunakan YYYY-MM-DD)" }, { status: 400 });
    }
    
    const id = uuid();
    
    // C2 FIX: Wrap balance check + insert dalam atomic transaction
    if (type === "expense") {
      await transaction(async (conn) => {
        // Row-level lock: SELECT ... FOR UPDATE
        const balanceRows = await txQuery<{ balance: number }>(
          conn,
          `SELECT a.opening_balance + COALESCE(SUM(
             CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
                  WHEN t.type IN ('expense','transfer_out') THEN -t.amount
                  WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) AS balance
           FROM accounts a
           LEFT JOIN transactions t ON t.account_id = a.id
           WHERE a.id = ? AND a.user_id = ?
           GROUP BY a.id, a.opening_balance
           FOR UPDATE`,
          [accountId, userId]
        );
        
        if (balanceRows.length === 0) throw new Error("Account not found");
        const balance = balanceRows[0].balance;
        
        // M2: Error sanitize (jangan leak balance)
        if (balance < amount) throw new Error("Saldo tidak cukup");
        
        // Insert dalam transaction
        await txExecute(
          conn,
          `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, NOW(), NOW())`,
          [id, userId, accountId, categoryId, type, amount, rawDate, title]
        );
      });
    } else {
      // Income: no transaction needed
      await execute(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, NOW(), NOW())`,
        [id, userId, accountId, categoryId, type, amount, rawDate, title]
      );
    }
    
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Saldo tidak cukup") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("POST /api/transactions failed:", e);
    return NextResponse.json({ error: "Gagal membuat transaksi" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUser();
    
    // R1: Rate limit GET too
    const { allowed } = apiLimiter(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak request" },
        { status: 429 }
      );
    }
    
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const existing = await query<{ account_id: string | null; category_id: string | null; type: string; amount: number }>(
      "SELECT account_id, category_id, type, amount FROM transactions WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    if (existing.length === 0) return NextResponse.json({ error: "Transaksi tidak ditemukan", code: "PUT_TX_NOT_FOUND" }, { status: 404 });

    // L2: Strict type check
    let amount: number;
    if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
      if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
        return NextResponse.json({ error: "Nominal harus angka valid", code: "PUT_BAD_AMOUNT" }, { status: 400 });
      }
      amount = body.amount;
    } else {
      amount = Number(existing[0].amount);
    }
    if (amount <= 0) return NextResponse.json({ error: "Nominal harus > 0", code: "PUT_BAD_AMOUNT" }, { status: 400 });
    
    // C1: Normalize type
    const type = String(body.type || existing[0].type || "expense").toLowerCase();
    if (type !== "income" && type !== "expense") return NextResponse.json({ error: "Tipe tidak valid", code: "PUT_BAD_TYPE" }, { status: 400 });

    let accountId: string | null = body.account_id ? String(body.account_id) : null;
    if (!accountId && body.account) {
      const accRows = await query<{ id: string }>("SELECT id FROM accounts WHERE user_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1", [userId, String(body.account)]);
      accountId = accRows.length > 0 ? accRows[0].id : null;
    }
    if (!accountId) accountId = existing[0].account_id;
    if (!accountId) return NextResponse.json({ error: "Akun wajib dipilih", code: "PUT_NO_ACCOUNT" }, { status: 400 });

    const ownerRows = await query<{ id: string }>("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
    if (ownerRows.length === 0) return NextResponse.json({ error: "Akun tidak ditemukan", code: "PUT_ACCOUNT_NOT_OWNED" }, { status: 400 });

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

    // H1: Sanitize title/note
    const title = body.title ? String(body.title).slice(0, 255).replace(/<[^>]*>/g, "") : null;

    // C2 FIX: Update dengan transaction untuk expense
    if (type === "expense") {
      await transaction(async (conn) => {
        const balanceRows = await txQuery<{ balance: number }>(
          conn,
          `SELECT a.opening_balance + COALESCE(SUM(
             CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
                  WHEN t.type IN ('expense','transfer_out') THEN -t.amount
                  WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) AS balance
           FROM accounts a
           LEFT JOIN transactions t ON t.account_id = a.id AND t.id != ?
           WHERE a.id = ? AND a.user_id = ?
           GROUP BY a.id, a.opening_balance
           FOR UPDATE`,
          [id, accountId, userId]
        );
        
        if (balanceRows.length === 0) throw new Error("Account not found");
        const balance = balanceRows[0].balance;
        
        if (balance < amount) throw new Error("Saldo tidak cukup");
        
        const result = await txExecute(
          conn,
          `UPDATE transactions SET account_id = ?, category_id = ?, type = ?, amount = ?,
            transaction_date = COALESCE(?, transaction_date), note = COALESCE(?, note), updated_at = NOW()
           WHERE id = ? AND user_id = ?`,
          [accountId, categoryId, type, amount, date, title, id, userId]
        );
        if (result.affectedRows === 0) throw new Error("No rows updated");
      });
    } else {
      const result = await execute(
        `UPDATE transactions SET account_id = ?, category_id = ?, type = ?, amount = ?,
          transaction_date = COALESCE(?, transaction_date), note = COALESCE(?, note), updated_at = NOW()
         WHERE id = ? AND user_id = ?`,
        [accountId, categoryId, type, amount, date, title, id, userId]
      );
      if (result.affectedRows === 0) return NextResponse.json({ error: "Transaksi tidak ditemukan", code: "PUT_NO_ROWS_UPDATED" }, { status: 404 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Saldo tidak cukup") return NextResponse.json({ error: msg }, { status: 400 });
    if (msg === "No rows updated") return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    console.error("PUT /api/transactions failed:", e);
    return NextResponse.json({ error: "Gagal update transaksi" }, { status: 400 });
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
    
    // L2: Validate result before delete
    if (rows.length === 0) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    
    const groupId = rows[0].transfer_group_id;
    let result;
    if (groupId) {
      result = await execute("DELETE FROM transactions WHERE transfer_group_id = ? AND user_id = ?", [groupId, userId]);
    } else {
      result = await execute("DELETE FROM transactions WHERE id = ? AND user_id = ?", [id, userId]);
    }
    
    // L2: Check affectedRows, return 404 if nothing deleted
    if (result.affectedRows === 0) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/transactions failed:", e);
    return NextResponse.json({ error: "Gagal hapus transaksi" }, { status: 400 });
  }
}
