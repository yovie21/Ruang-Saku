import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

async function ensureTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS debts (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      kind ENUM('debt','receivable') NOT NULL DEFAULT 'debt',
      person VARCHAR(120) NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      paid DECIMAL(18,2) NOT NULL DEFAULT 0,
      due_date DATE NULL,
      note VARCHAR(500) NULL,
      installments INT NULL,
      installments_paid INT NOT NULL DEFAULT 0,
      is_settled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT debts_amount_check CHECK (amount > 0),
      KEY debts_user_idx (user_id, is_settled)
    ) ENGINE=InnoDB`
  );
  // Kolom rencana cicilan untuk DB yang dibuat sebelum fitur ini ada.
  try {
    await execute(`ALTER TABLE debts ADD COLUMN installments INT NULL`, []);
  } catch {
    /* kolom sudah ada — abaikan */
  }
  // Penghitung cicilan ke berapa yang sudah dibayar.
  try {
    await execute(`ALTER TABLE debts ADD COLUMN installments_paid INT NOT NULL DEFAULT 0`, []);
  } catch {
    /* kolom sudah ada — abaikan */
  }
}

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const history = searchParams.get("history") === "1";
    const rows = await query<{
      id: string; kind: "debt" | "receivable"; person: string;
      amount: number; paid: number; due_date: string | null;
      note: string | null; created_at: string; updated_at: string;
      installments: number | null; installments_paid: number;
    }>(
      history
        ? `SELECT id, kind, person, amount, paid, due_date, note, created_at, updated_at, installments, installments_paid,
                  GREATEST(0, amount - paid) AS remaining
           FROM debts WHERE user_id = ? AND is_settled = 1
           ORDER BY updated_at DESC LIMIT 50`
        : `SELECT id, kind, person, amount, paid, due_date, note, created_at, updated_at, installments, installments_paid,
                  GREATEST(0, amount - paid) AS remaining
           FROM debts WHERE user_id = ? AND is_settled = 0
           ORDER BY (due_date IS NULL), due_date ASC, created_at DESC LIMIT 100`,
      [userId]
    );
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    await ensureTable();
    const body = await req.json();
    const kind = body.kind === "receivable" ? "receivable" : "debt";
    const person = String(body.person || "").trim().slice(0, 120);
    const amount = Number(body.amount);
    if (!person) return NextResponse.json({ error: "Nama orang wajib diisi" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    const due = body.due_date ? String(body.due_date).slice(0, 10) : null;
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      return NextResponse.json({ error: "Format jatuh tempo tidak valid" }, { status: 400 });
    }
    const installments = body.installments !== undefined && body.installments !== null && body.installments !== ""
      ? parseInt(String(body.installments), 10)
      : null;
    if (installments !== null && (!installments || installments < 1 || installments > 60)) {
      return NextResponse.json({ error: "Jumlah cicilan 1–60 kali" }, { status: 400 });
    }
    const id = uuid();
    await execute(
      `INSERT INTO debts (id, user_id, kind, person, amount, paid, due_date, note, installments, is_settled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0, NOW(), NOW())`,
      [id, userId, kind, person, amount, due, body.note ? String(body.note).slice(0, 500) : null, installments]
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUser();
    await ensureTable();
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    // Mode kembalikan ke belum lunas (riwayat salah lunas / bayar ulang).
    if (body.reopen === true) {
      const rows = await query<{ id: string }>("SELECT id FROM debts WHERE id = ? AND user_id = ?", [id, userId]);
      if (rows.length === 0) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
      await execute("UPDATE debts SET is_settled = 0, updated_at = NOW() WHERE id = ? AND user_id = ?", [id, userId]);
      return NextResponse.json({ ok: true });
    }
    // Mode bayar 1 cicilan: nominal otomatis = sisa / sisa cicilan
    // (cicilan terakhir otomatis = sisa penuh agar tidak ada selisih pembulatan).
    // Sekaligus mencatat transaksi agar saldo akun + aktivitas terbaru ikut berubah.
    // - Bayar utang (debt) = pengeluaran dari akun pilihan.
    // - Terima piutang (receivable) = pemasukan ke akun pilihan.
    if (body.pay_installment === true) {
      const rows = await query<{
        amount: number; paid: number; installments: number | null; installments_paid: number;
        kind: "debt" | "receivable"; person: string;
      }>(
        "SELECT amount, paid, installments, installments_paid, kind, person FROM debts WHERE id = ? AND user_id = ?",
        [id, userId]
      );
      if (rows.length === 0) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
      const kind = rows[0].kind === "receivable" ? "receivable" : "debt";
      const person = String(rows[0].person || "").slice(0, 120);
      const total = Number(rows[0].amount);
      const cur = Number(rows[0].paid);
      const rest = Math.max(0, total - cur);
      if (rest <= 0) return NextResponse.json({ error: "Sudah lunas" }, { status: 400 });

      const accountId = body.account_id ? String(body.account_id) : "";
      if (!accountId) return NextResponse.json({ error: "Pilih akun pembayaran dulu" }, { status: 400 });
      const accRows = await query<{ id: string; name: string }>("SELECT id, name FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
      if (accRows.length === 0) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });

      const plan = Number(rows[0].installments ?? 0);
      const doneCount = Number(rows[0].installments_paid ?? 0);
      let pay: number;
      let nextCount = doneCount;
      if (plan > 0 && doneCount < plan - 1) {
        // Masih ada cicilan berikut: bayar per cicilan, cicilan terakhir = sisa.
        const remainingCount = plan - doneCount;
        pay = Math.min(rest, Math.max(1, Math.round(total / plan)));
        // Bila bayar per cicilan penuh melebihi sisa (pembulatan), pakai sisa.
        if (pay >= rest) pay = rest;
        else if (remainingCount <= 1) pay = rest;
        else {
          // Pastikan cicilan terakhir nanti tidak 0/negatif: batasi agar
          // sisa setelah bayar ini cukup untuk minimal Rp1 per sisa cicilan.
          const maxPay = rest - (remainingCount - 1);
          if (pay > maxPay) pay = Math.max(1, maxPay);
        }
        nextCount = doneCount + 1;
      } else {
        // Tanpa rencana cicilan, atau cicilan terakhir: lunasi sisa.
        pay = rest;
        nextCount = plan > 0 ? plan : doneCount + 1;
      }

      // Kategori: dari pilihan user, default "Utang"/"Piutang" (dibuat otomatis bila belum ada).
      const txType = kind === "debt" ? "expense" : "income";
      const defaultCat = kind === "debt" ? "Utang" : "Piutang";
      const catName = body.category ? String(body.category).slice(0, 80) : defaultCat;
      let catRows = await query<{ id: string }>(
        "SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?",
        [userId, catName, txType]
      );
      let categoryId: string | null = catRows.length > 0 ? catRows[0].id : null;
      if (!categoryId) {
        categoryId = uuid();
        await execute(
          `INSERT INTO categories (id, user_id, name, type, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, FALSE, NOW(), NOW())`,
          [categoryId, userId, catName, txType]
        );
      }

      // Cek saldo akun untuk bayar utang (pengeluaran). Terima piutang selalu boleh.
      if (txType === "expense") {
        const balRows = await query<{ balance: number }>(
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
        const balance = balRows.length > 0 ? Number(balRows[0].balance) : 0;
        if (balance < pay) {
          return NextResponse.json({ error: `Saldo ${accRows[0].name} tidak cukup (tersisa Rp ${Math.round(balance).toLocaleString("id-ID")})` }, { status: 400 });
        }
      }

      const next = Math.min(total, cur + pay);
      const settled = next >= total ? 1 : 0;
      if (settled) nextCount = plan > 0 ? plan : nextCount;
      await execute("UPDATE debts SET paid = ?, installments_paid = ?, is_settled = ?, updated_at = NOW() WHERE id = ? AND user_id = ?", [next, nextCount, settled, id, userId]);

      // Catat transaksi agar muncul di Aktivitas terbaru + saldo total menyesuaikan.
      const label = kind === "debt"
        ? `Bayar utang ${person}${plan > 0 ? ` (${nextCount}/${plan})` : ""}`
        : `Terima piutang ${person}${plan > 0 ? ` (${nextCount}/${plan})` : ""}`;
      const today = new Date().toISOString().slice(0, 10);
      await execute(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, transaction_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [uuid(), userId, accountId, categoryId, txType, pay, today, label.slice(0, 500)]
      );
      return NextResponse.json({ ok: true, paid: next, settled: Boolean(settled), installment_no: nextCount, installment_total: plan > 0 ? plan : null, installment_amount: pay, transaction_created: true });
    }
    // Mode bayar/cicil manual: tambah paid (tetap didukung untuk koreksi manual)
    if (body.pay !== undefined) {
      const pay = Number(body.pay);
      if (!pay || pay <= 0) return NextResponse.json({ error: "Nominal bayar harus > 0" }, { status: 400 });
      const rows = await query<{ amount: number; paid: number; installments_paid: number }>(
        "SELECT amount, paid, installments_paid FROM debts WHERE id = ? AND user_id = ?",
        [id, userId]
      );
      if (rows.length === 0) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
      const total = Number(rows[0].amount);
      const cur = Number(rows[0].paid);
      const next = Math.min(total, cur + pay);
      const settled = next >= total ? 1 : 0;
      const nextCount = settled ? Number(rows[0].installments_paid ?? 0) + 1 : Number(rows[0].installments_paid ?? 0) + 1;
      await execute("UPDATE debts SET paid = ?, installments_paid = ?, is_settled = ?, updated_at = NOW() WHERE id = ? AND user_id = ?", [next, nextCount, settled, id, userId]);
      return NextResponse.json({ ok: true, paid: next, settled: Boolean(settled) });
    }
    // Mode edit biasa
    const sets: string[] = ["updated_at = NOW()"];
    const params: (string | number | null)[] = [];
    if (body.person !== undefined) {
      const person = String(body.person).trim().slice(0, 120);
      if (!person) return NextResponse.json({ error: "Nama orang wajib diisi" }, { status: 400 });
      sets.push("person = ?"); params.push(person);
    }
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
      sets.push("amount = ?"); params.push(amount);
    }
    if (body.due_date !== undefined) {
      const due = body.due_date ? String(body.due_date).slice(0, 10) : null;
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        return NextResponse.json({ error: "Format jatuh tempo tidak valid" }, { status: 400 });
      }
      sets.push("due_date = ?"); params.push(due);
    }
    if (body.note !== undefined) {
      sets.push("note = ?"); params.push(body.note ? String(body.note).slice(0, 500) : null);
    }
    if (body.kind !== undefined) {
      sets.push("kind = ?"); params.push(body.kind === "receivable" ? "receivable" : "debt");
    }
    if (body.installments !== undefined) {
      const inst = body.installments === null || body.installments === ""
        ? null
        : parseInt(String(body.installments), 10);
      if (inst !== null && (!inst || inst < 1 || inst > 60)) {
        return NextResponse.json({ error: "Jumlah cicilan 1–60 kali" }, { status: 400 });
      }
      sets.push("installments = ?"); params.push(inst);
    }
    if (sets.length === 1) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
    params.push(id, userId);
    const res = await execute(`UPDATE debts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
    if (res.affectedRows === 0) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUser();
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await execute("DELETE FROM debts WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
