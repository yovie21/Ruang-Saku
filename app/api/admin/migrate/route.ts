import { NextResponse } from "next/server";
import { execute } from "@/lib/db";

const migrationSQL = [
  `CREATE TABLE IF NOT EXISTS recurring_rules (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(160) NOT NULL,
    type ENUM('income', 'expense') NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    category_id CHAR(36) NULL,
    account_id CHAR(36) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    next_run_date DATE NOT NULL,
    end_date DATE NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT recurring_rules_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT recurring_rules_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    CONSTRAINT recurring_rules_category_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    KEY recurring_rules_user_active_idx (user_id, is_active, next_run_date)
  ) ENGINE=InnoDB`,
  `ALTER TABLE budgets ADD KEY IF NOT EXISTS budgets_user_month_idx (user_id, month_start)`,
  `ALTER TABLE transactions ADD KEY IF NOT EXISTS transactions_user_date_idx (user_id, transaction_date DESC)`,
  `ALTER TABLE categories ADD KEY IF NOT EXISTS categories_user_idx (user_id, is_archived)`
];

export async function POST(req: Request) {
  // Temporary: Allow migration without token for initial setup
  // TODO: Require token in production after first run
  
  try {
    console.log("Applying performance migration...");
    const results: string[] = [];
    
    for (const stmt of migrationSQL) {
      try {
        await execute(stmt);
        const msg = `✓ ${stmt.substring(0, 60).trim()}...`;
        console.log(msg);
        results.push(msg);
      } catch (e: any) {
        if (e.code === "ER_DUP_KEYNAME" || e.code === 1061 || e.message?.includes("Duplicate key")) {
          const msg = `⚠ Index already exists: ${stmt.substring(0, 40)}`;
          console.log(msg);
          results.push(msg);
        } else {
          throw e;
        }
      }
    }
    
    console.log("✓ Migration complete!");
    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (e: any) {
    console.error("✗ Migration failed:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
