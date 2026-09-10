import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || currentMonthStart();
    const rows = await query(
      `SELECT b.id, b.amount AS budget, b.month_start, c.id AS category_id, c.name AS category
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ? AND b.month_start = ?
       ORDER BY c.name`,
      [userId, month]
    );
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal anggaran harus > 0" }, { status: 400 });
    const month = String(body.month_start || currentMonthStart()).slice(0, 10);

    let categoryId: string | null = null;
    if (body.category_id) {
      categoryId = String(body.category_id);
    } else if (body.category) {
      const rows = await query<{ id: string }>(
        "SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = 'expense'",
        [userId, String(body.category)]
      );
      categoryId = rows.length > 0 ? rows[0].id : null;
    }
    if (!categoryId) return NextResponse.json({ error: "Kategori pengeluaran tidak ditemukan" }, { status: 400 });

    await execute(
      `INSERT INTO budgets (id, user_id, category_id, amount, month_start, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), updated_at = NOW()`,
      [uuid(), userId, categoryId, amount, month]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const amount = Number(body.amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal anggaran harus > 0" }, { status: 400 });
    const res = await execute("UPDATE budgets SET amount = ?, updated_at = NOW() WHERE id = ? AND user_id = ?", [amount, id, userId]);
    if (res.affectedRows === 0) return NextResponse.json({ error: "Anggaran tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await execute("DELETE FROM budgets WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
