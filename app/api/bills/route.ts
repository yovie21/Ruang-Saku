import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Convert DD-MM-YYYY or YYYY-MM-DD → YYYY-MM-DD
function parseDateInput(input: string): string {
  const str = String(input || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    if (Number.isNaN(Date.parse(`${str}T00:00:00Z`))) throw new Error("Tanggal tidak valid");
    return str;
  }
  const match = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) throw new Error("Format tanggal harus DD-MM-YYYY atau YYYY-MM-DD");
  const [, day, month, year] = match;
  const formatted = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (Number.isNaN(Date.parse(`${formatted}T00:00:00Z`))) throw new Error("Tanggal tidak valid");
  return formatted;
}

// Convert YYYY-MM-DD → DD-MM-YYYY
function formatDateOutput(yyyymmdd: string): string {
  const [year, month, day] = String(yyyymmdd).split("-");
  return `${day}-${month}-${year}`;
}

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
    const rows = await query(
      `SELECT id, title, amount, due_date, is_paid, paid_at FROM bills WHERE user_id = ? ORDER BY is_paid ASC, due_date ASC LIMIT 200`,
      [userId]
    );
    // Convert due_date from YYYY-MM-DD → DD-MM-YYYY
    return NextResponse.json(rows.map((r: any) => ({ ...r, due_date: formatDateOutput(r.due_date) })));
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
    const dueDateInput = String(body.due_date || "");
    
    if (!title) return NextResponse.json({ error: "Nama tagihan wajib diisi" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999999) 
      return NextResponse.json({ error: "Nominal tagihan tidak valid" }, { status: 400 });
    
    let dueDate: string;
    try {
      dueDate = parseDateInput(dueDateInput); // Convert DD-MM-YYYY → YYYY-MM-DD
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    
    const id = uuid();
    await execute("INSERT INTO bills (id,user_id,title,amount,due_date) VALUES (?,?,?,?,?)", [id, userId, title, amount, dueDate]);
    return NextResponse.json({ id, due_date: dueDateInput }, { status: 201 });
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
