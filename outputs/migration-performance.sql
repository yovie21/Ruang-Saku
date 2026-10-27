-- Performance optimization migration
-- Add missing indices & recurring_rules table

-- 1. Add recurring_rules table if not exists
CREATE TABLE IF NOT EXISTS recurring_rules (
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
) ENGINE=InnoDB;

-- 2. Add index to budgets for query performance
-- Pattern: WHERE user_id = ? AND month_start = ? ... ORDER BY ...
ALTER TABLE budgets ADD KEY budgets_user_month_idx (user_id, month_start);

-- 3. Add index to transactions for common queries
-- Pattern: WHERE user_id = ? AND transaction_date BETWEEN ...
ALTER TABLE transactions ADD KEY transactions_user_date_idx (user_id, transaction_date DESC);

-- 4. Add index to goals for user queries
ALTER TABLE goals ADD KEY goals_user_active_idx (user_id, is_achieved);

-- 5. Add index to splits for user queries
ALTER TABLE splits ADD KEY splits_user_date_idx (user_id, split_date DESC);

-- 6. Add index to debts for user queries
ALTER TABLE debts ADD KEY debts_user_kind_idx (user_id, kind, is_settled);

-- 7. Add index to bills for due date queries
ALTER TABLE bills ADD KEY bills_user_due_idx (user_id, is_paid, due_date ASC);

-- 8. Add index to categories for usage queries
ALTER TABLE categories ADD KEY categories_user_idx (user_id, is_archived);
