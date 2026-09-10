import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { addFrequency } from "@/lib/recurring";

type Rule = {
  id: string; title: string; type: string; amount: number;
  category_id: string | null; account_id: string;
  frequency: string; next_run_date: string; end_date: string | null;
};

export async function POST() {
  try {
    const userId = await requireUser();
    const today = new Date().toISOString().slice(0, 10);
    const rules = await query<Rule>(
      `SELECT id, title, type, amount, category_id, account_id, frequency, next_run_date, end_date
       FROM recurring_rules
       WHERE user_id = ? AND is_active = 1 AND next_run_date <= ?
       ORDER BY next_run_date LIMIT 50`,
      [userId, today]
    );
    let created = 0;
    const skipped: string[] = [];
    for (const r of rules) {
      if (r.end_date && r.next_run_date > r.end_date) {
        await execute("UPDATE recurring_rules SET is_active = 0 WHERE id = ? AND user_id = ?", [r.id, userId]);
        continue;
      }
      if (r.type === "expense") {
        const bal = await query<{ balance: number }>(
          `SELECT a.opening_balance + COALESCE(SUM(
             CASE WHEN t.type IN ('income','transfer_in') THEN t.amount
                  WHEN t.type IN ('expense','transfer_out') THEN -t.amount
                  WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) AS balance
           FROM accounts a
           LEFT JOIN transactions t ON t.account_id = a.id
           WHERE a.id = ? AND a.user_id = ?
           GROUP BY a.id, a.opening_balance`,
          [r.account_id, userId]
        );
        if (bal.length > 0 && Number(bal[0].balance) < Number(r.amount)) {
          skipped.push(r.title);
          await execute("UPDATE recurring_rules SET next_run_date = ?, updated_at = NOW() WHERE id = ? AND user_id = ?", [addFrequency(r.next_run_date, r.frequency), r.id, userId]);
          continue;
        }
      }
      await execute(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, NOW(), NOW())`,
        [uuid(), userId, r.account_id, r.category_id, r.type, r.amount, r.title]
      );
      await execute("UPDATE recurring_rules SET next_run_date = ?, updated_at = NOW() WHERE id = ? AND user_id = ?", [addFrequency(r.next_run_date, r.frequency), r.id, userId]);
      created += 1;
    }
    return NextResponse.json({ created, skipped, total: rules.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
