import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

async function ensureTable() {
  await execute(`CREATE TABLE IF NOT EXISTS bills (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(160) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    due_date DATE NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY bills_user_due_idx (user_id, is_paid, due_date)
  ) ENGINE=InnoDB`);
}

export async function GET() {
  try {
    const userId = await requireUser();
    await ensureTable();
    return NextResponse.json(await query(
      `SELECT id, title, amount, due_date, is_paid, paid_at FROM bills WHERE user_id = ? ORDER BY is_paid ASC, due_date ASC LIMIT 200`,
      [userId]
    ));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    await ensureTable();
    const body = await req.json();
    const title = String(body.title || "").trim().slice(0, 160);
    const amount = Number(body.amount);
    const dueDate = String(body.due_date || "");
    if (!title) return NextResponse.json({ error: "Nama tagihan wajib diisi" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999999) return NextResponse.json({ error: "Nominal tagihan tidak valid" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) return NextResponse.json({ error: "Tanggal jatuh tempo tidak valid" }, { status: 400 });
    const id = uuid();
    await execute("INSERT INTO bills (id,user_id,title,amount,due_date) VALUES (?,?,?,?,?)", [id, userId, title, amount, dueDate]);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUser();
    await ensureTable();
    const { id, is_paid } = await req.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ error: "ID tagihan tidak valid" }, { status: 400 });
    if (typeof is_paid !== "boolean") return NextResponse.json({ error: "Status pembayaran tidak valid" }, { status: 400 });
    const result = await execute("UPDATE bills SET is_paid = ?, paid_at = ? WHERE id = ? AND user_id = ?", [is_paid ? 1 : 0, is_paid ? new Date().toISOString().slice(0, 19).replace("T", " ") : null, id, userId]);
    if (!result.affectedRows) return NextResponse.json({ error: "Tagihan tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUser();
    await ensureTable();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID tagihan tidak valid" }, { status: 400 });
    const result = await execute("DELETE FROM bills WHERE id = ? AND user_id = ?", [id, userId]);
    if (!result.affectedRows) return NextResponse.json({ error: "Tagihan tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
