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
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: no user session" }, { status: 401 });
    }
    
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[recurring/run] START: userId=${userId}, today=${today}`);
    
    // Check recurring_rules table has data for this user
    const ruleCount = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recurring_rules WHERE user_id = ?`,
      [userId]
    );
    console.log(`[recurring/run] total rules for user: ${ruleCount[0]?.count || 0}`);
    
    // Get due rules
    const rules = await query<Rule>(
      `SELECT id, title, type, amount, category_id, account_id, frequency, next_run_date, end_date
       FROM recurring_rules
       WHERE user_id = ? AND is_active = 1 AND next_run_date <= ?
       ORDER BY next_run_date LIMIT 50`,
      [userId, today]
    );
    
    console.log(`[recurring/run] due today (${today}): ${rules.length} rules`);
    if (rules.length === 0) {
      return NextResponse.json({ created: 0, skipped: [], total: 0, message: "No due rules" });
    }
    
    let created = 0;
    const skipped: string[] = [];
    
    for (const r of rules) {
      try {
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
            console.log(`[recurring/run] SKIP: ${r.title} (insufficient balance)`);
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
        
        console.log(`[recurring/run] CREATE: ${r.title}`);
        created += 1;
      } catch (itemError) {
        console.error(`[recurring/run] ERROR on rule ${r.id}:`, itemError);
        skipped.push(r.title + " (error)");
      }
    }
    
    console.log(`[recurring/run] COMPLETE: created=${created}, skipped=${skipped.length}`);
    return NextResponse.json({ created, skipped, total: rules.length });
  } catch (e) {
    const errorMsg = (e as Error).message;
    const errorStack = (e as Error).stack;
    console.error(`[recurring/run] FATAL ERROR: ${errorMsg}`, errorStack);
    return NextResponse.json({ error: errorMsg, fatal: true }, { status: 400 });
  }
}
