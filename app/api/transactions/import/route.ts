import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

type Row = { title: string; type: "income" | "expense"; category: string; account: string; amount: number; date: string };

async function balanceOf(userId: string, accountId: string): Promise<number> {
  const rows = await query<{ balance: number }>(
    `SELECT a.opening_balance + COALESCE(SUM(
       CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
            WHEN t.type IN ('expense','transfer_out') THEN -t.amount
            WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) AS balance
     FROM accounts a
     LEFT JOIN transactions t ON t.account_id = a.id
     WHERE a.id = ? AND a.user_id = ?
     GROUP BY a.id, a.opening_balance`,
    [accountId, userId]
  );
  return rows.length > 0 ? Number(rows[0].balance) : 0;
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const rows: Row[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: "Tidak ada baris untuk diimpor" }, { status: 400 });
    if (rows.length > 200) return NextResponse.json({ error: "Maksimal 200 baris per impor" }, { status: 400 });

    const accs = await query<{ id: string; name: string }>("SELECT id, name FROM accounts WHERE user_id = ?", [userId]);
    const accMap = new Map(accs.map(a => [a.name.toLowerCase(), a.id]));
    const balances = new Map<string, number>();

    let created = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const line = i + 1;
      try {
        const amount = Number(r.amount);
        if (!r.title || !String(r.title).trim()) throw new Error(`baris ${line}: judul kosong`);
        if (r.type !== "income" && r.type !== "expense") throw new Error(`baris ${line}: tipe harus income/expense`);
        if (!amount || amount <= 0) throw new Error(`baris ${line}: nominal tidak valid`);
        const accountId = accMap.get(String(r.account || "").toLowerCase());
        if (!accountId) throw new Error(`baris ${line}: akun "${r.account}" tidak ditemukan`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ""))) throw new Error(`baris ${line}: tanggal harus YYYY-MM-DD`);

        if (r.type === "expense") {
          if (!balances.has(accountId)) balances.set(accountId, await balanceOf(userId, accountId));
          const bal = balances.get(accountId) ?? 0;
          if (bal < amount) throw new Error(`baris ${line}: saldo ${r.account} kurang`);
          balances.set(accountId, bal - amount);
        } else {
          if (!balances.has(accountId)) balances.set(accountId, await balanceOf(userId, accountId));
          balances.set(accountId, (balances.get(accountId) ?? 0) + amount);
        }

        const catRows = r.category
          ? await query<{ id: string }>("SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?", [userId, String(r.category), r.type])
          : [];
        const categoryId = catRows.length > 0 ? catRows[0].id : null;
        await execute(
          `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [uuid(), userId, accountId, categoryId, r.type, amount, String(r.date).slice(0, 10), String(r.title).slice(0, 500)]
        );
        created += 1;
      } catch (e) {
        errors.push((e as Error).message);
        if (errors.length >= 10) {
          errors.push(`…dan ${rows.length - i - 1} baris lain dilewati`);
          break;
        }
      }
    }
    return NextResponse.json({ created, failed: errors.length, errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
