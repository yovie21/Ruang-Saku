-- Ruang Saku - MySQL 8.0+ schema
-- Import this file into an empty MySQL Cloud database.

CREATE DATABASE IF NOT EXISTS ruang_saku
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE ruang_saku;

CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(191) NOT NULL,
  name VARCHAR(191) NULL,
  image VARCHAR(500) NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB;

-- Stores the Google account identity. provider_account_id is Google's stable user ID.
CREATE TABLE auth_accounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_account_id VARCHAR(191) NOT NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  expires_at INT NULL,
  token_type VARCHAR(50) NULL,
  scope VARCHAR(500) NULL,
  id_token TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT auth_accounts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY auth_accounts_provider_unique (provider, provider_account_id),
  KEY auth_accounts_user_idx (user_id)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NULL,
  name VARCHAR(80) NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  icon VARCHAR(50) NULL,
  color CHAR(7) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT categories_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY categories_user_name_type_unique (user_id, name, type),
  KEY categories_user_type_idx (user_id, type)
) ENGINE=InnoDB;

CREATE TABLE accounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  account_type ENUM('bank', 'ewallet', 'cash', 'credit_card', 'investment') NOT NULL,
  institution_name VARCHAR(100) NULL,
  account_number_last4 CHAR(4) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  opening_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  opening_balance_date DATE NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT accounts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY accounts_user_active_idx (user_id, is_archived)
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  category_id CHAR(36) NULL,
  type ENUM('income', 'expense', 'transfer_in', 'transfer_out', 'adjustment') NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  transaction_date DATE NOT NULL,
  note VARCHAR(500) NULL,
  transfer_group_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT transactions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT transactions_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT transactions_category_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT transactions_amount_check CHECK (amount > 0),
  KEY transactions_user_date_idx (user_id, transaction_date DESC),
  KEY transactions_account_date_idx (account_id, transaction_date DESC),
  KEY transactions_transfer_group_idx (transfer_group_id)
) ENGINE=InnoDB;

CREATE TABLE budgets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  category_id CHAR(36) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  month_start DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT budgets_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT budgets_category_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT budgets_amount_check CHECK (amount > 0),
  UNIQUE KEY budgets_user_category_month_unique (user_id, category_id, month_start)
) ENGINE=InnoDB;

-- Use this view to read live account balances. Do not store a separately editable balance.
CREATE VIEW account_balances AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.name AS account_name,
  a.currency,
  a.opening_balance + COALESCE(SUM(CASE
    WHEN t.type IN ('income', 'transfer_in') THEN t.amount
    WHEN t.type IN ('expense', 'transfer_out') THEN -t.amount
    WHEN t.type = 'adjustment' THEN t.amount
    ELSE 0
  END), 0) AS current_balance
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
GROUP BY a.id, a.user_id, a.name, a.currency, a.opening_balance;

-- Default categories are created per user after first Google login.
-- Example: INSERT INTO categories (id, user_id, name, type, is_default) VALUES (UUID(), '<USER_ID>', 'Makan & Minum', 'expense', TRUE);
