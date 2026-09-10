import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUser();
    const rows = await query(
      `SELECT r.id, r.title, r.type, r.amount, r.frequency, r.start_date, r.next_run_date,
              r.end_date, r.is_active, r.note,
              c.name AS category, a.name AS account, r.category_id, r.account_id
       FROM recurring_rules r
       LEFT JOIN categories c ON c.id = r.category_id
       LEFT JOIN accounts a ON a.id = r.account_id
       WHERE r.user_id = ?
       ORDER BY r.is_active DESC, r.next_run_date`,
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
    const body = await req.json();
    const title = String(body.title || "").trim().slice(0, 200);
    const type = String(body.type || "expense");
    const amount = Number(body.amount);
    const frequency = String(body.frequency || "monthly");
    if (!title) return NextResponse.json({ error: "Nama jadwal wajib diisi" }, { status: 400 });
    if (type !== "income" && type !== "expense") return NextResponse.json({ error: "Tipe tidak valid" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) return NextResponse.json({ error: "Frekuensi tidak valid" }, { status: 400 });

    let accountId: string | null = body.account_id ? String(body.account_id) : null;
    if (!accountId && body.account) {
      const rows = await query<{ id: string }>("SELECT id FROM accounts WHERE user_id = ? AND name = ?", [userId, String(body.account)]);
      accountId = rows.length > 0 ? rows[0].id : null;
    }
    if (!accountId) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });

    let categoryId: string | null = body.category_id ? String(body.category_id) : null;
    if (!categoryId && body.category) {
      const rows = await query<{ id: string }>("SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?", [userId, String(body.category), type]);
      categoryId = rows.length > 0 ? rows[0].id : null;
    }

    const startDate = body.start_date ? String(body.start_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const nextRun = body.next_run_date ? String(body.next_run_date).slice(0, 10) : startDate;
    const endDate = body.end_date ? String(body.end_date).slice(0, 10) : null;
    const note = body.note ? String(body.note).slice(0, 255) : null;
    const id = uuid();
    await execute(
      `INSERT INTO recurring_rules (id, user_id, title, type, amount, category_id, account_id, frequency, start_date, next_run_date, end_date, is_active, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [id, userId, title, type, amount, categoryId, accountId, frequency, startDate, nextRun, endDate, note]
    );
    return NextResponse.json({ id }, { status: 201 });
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
    const sets: string[] = ["updated_at = NOW()"];
    const params: (string | number | null)[] = [];
    if (body.title !== undefined) { sets.push("title = ?"); params.push(String(body.title).slice(0, 200)); }
    if (body.amount !== undefined) {
      const a = Number(body.amount);
      if (!a || a <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
      sets.push("amount = ?"); params.push(a);
    }
    if (body.is_active !== undefined) { sets.push("is_active = ?"); params.push(body.is_active ? 1 : 0); }
    if (body.next_run_date !== undefined) { sets.push("next_run_date = ?"); params.push(String(body.next_run_date).slice(0, 10)); }
    if (body.end_date !== undefined) { sets.push("end_date = ?"); params.push(body.end_date ? String(body.end_date).slice(0, 10) : null); }
    if (body.frequency !== undefined) {
      if (!["daily", "weekly", "monthly", "yearly"].includes(String(body.frequency))) return NextResponse.json({ error: "Frekuensi tidak valid" }, { status: 400 });
      sets.push("frequency = ?"); params.push(String(body.frequency));
    }
    if (body.account_id !== undefined) { sets.push("account_id = ?"); params.push(String(body.account_id)); }
    if (body.category_id !== undefined) { sets.push("category_id = ?"); params.push(body.category_id ? String(body.category_id) : null); }
    params.push(id, userId);
    const res = await execute(`UPDATE recurring_rules SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
    if (res.affectedRows === 0) return NextResponse.json({ error: "Jadwal tidak ditemukan" }, { status: 404 });
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
    await execute("DELETE FROM recurring_rules WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
