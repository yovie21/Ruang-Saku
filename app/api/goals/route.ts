import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUser();
    const rows = await query<{
      id: string; name: string; target_amount: number; deadline: string | null;
      saved: number; deposits: number;
    }>(
      `SELECT g.id, g.name, g.target_amount, g.deadline,
              COALESCE((SELECT SUM(a.amount) FROM goal_allocations a WHERE a.goal_id = g.id AND a.user_id = ?), 0) AS saved,
              COALESCE((SELECT COUNT(*) FROM goal_allocations a WHERE a.goal_id = g.id AND a.user_id = ?), 0) AS deposits
       FROM savings_goals g
       WHERE g.user_id = ? AND g.is_archived = 0
       ORDER BY g.created_at DESC`,
      [userId, userId, userId]
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
    const name = String(body.name || "").trim();
    const target = Number(body.target_amount);
    if (!name) return NextResponse.json({ error: "Nama target wajib diisi" }, { status: 400 });
    if (!target || target <= 0) return NextResponse.json({ error: "Target harus > 0" }, { status: 400 });
    const deadline = body.deadline ? String(body.deadline).slice(0, 10) : null;
    const id = uuid();
    await execute(
      `INSERT INTO savings_goals (id, user_id, name, target_amount, deadline, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [id, userId, name.slice(0, 120), target, deadline]
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
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 120);
      if (!name) return NextResponse.json({ error: "Nama target wajib diisi" }, { status: 400 });
      sets.push("name = ?"); params.push(name);
    }
    if (body.target_amount !== undefined) {
      const target = Number(body.target_amount);
      if (!target || target <= 0) return NextResponse.json({ error: "Target harus > 0" }, { status: 400 });
      sets.push("target_amount = ?"); params.push(target);
    }
    if (body.deadline !== undefined) {
      const deadline = body.deadline ? String(body.deadline).slice(0, 10) : null;
      if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
        return NextResponse.json({ error: "Format tenggat tidak valid" }, { status: 400 });
      }
      sets.push("deadline = ?"); params.push(deadline);
    }
    if (sets.length === 1) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
    params.push(id, userId);
    const res = await execute(`UPDATE savings_goals SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
    if (res.affectedRows === 0) return NextResponse.json({ error: "Target tidak ditemukan" }, { status: 404 });
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
    await execute("UPDATE savings_goals SET is_archived = 1 WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
