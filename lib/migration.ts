import { execute } from "@/lib/db";

const migrationSQL = [
  `CREATE TABLE IF NOT EXISTS goals (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(160) NOT NULL,
    target_amount DECIMAL(18,2) NOT NULL,
    current_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    category VARCHAR(50) NULL,
    due_date DATE NULL,
    is_achieved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT goals_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    KEY goals_user_active_idx (user_id, is_achieved)
  ) ENGINE=InnoDB`,
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
  `ALTER TABLE budgets ADD KEY budgets_user_month_idx (user_id, month_start)`,
  `ALTER TABLE transactions ADD KEY transactions_user_date_idx (user_id, transaction_date DESC)`,
  `ALTER TABLE goals ADD KEY goals_user_active_idx (user_id, is_achieved)`,
  `ALTER TABLE splits ADD KEY splits_user_date_idx (user_id, split_date DESC)`,
  `ALTER TABLE debts ADD KEY debts_user_kind_idx (user_id, kind, is_settled)`,
  `ALTER TABLE bills ADD KEY bills_user_due_idx (user_id, is_paid, due_date ASC)`,
  `ALTER TABLE categories ADD KEY categories_user_idx (user_id, is_archived)`
];

export async function runMigration() {
  try {
    console.log("Applying performance migration...");
    for (const stmt of migrationSQL) {
      try {
        await execute(stmt);
        console.log("✓", stmt.substring(0, 60).trim() + "...");
      } catch (e: any) {
        if (e.code === "ER_DUP_KEYNAME" || e.code === "1061") {
          console.log("⚠ Index already exists (skip):", stmt.substring(0, 40));
        } else {
          throw e;
        }
      }
    }
    console.log("\n✓ Migration complete!");
  } catch (e) {
    console.error("✗ Migration failed:", e);
    throw e;
  }
}

// Auto-run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}
