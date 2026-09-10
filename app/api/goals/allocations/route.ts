import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const goalId = searchParams.get("goal_id");
    if (!goalId) return NextResponse.json({ error: "goal_id required" }, { status: 400 });
    const rows = await query(
      `SELECT a.id, a.amount, a.allocation_date, a.note, acc.name AS account
       FROM goal_allocations a
       LEFT JOIN accounts acc ON acc.id = a.account_id
       WHERE a.user_id = ? AND a.goal_id = ?
       ORDER BY a.allocation_date DESC, a.created_at DESC LIMIT 50`,
      [userId, goalId]
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
    const goalId = String(body.goal_id || "");
    const direction = String(body.direction || "deposit");
    const amount = Number(body.amount);
    if (!goalId) return NextResponse.json({ error: "goal_id required" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
    if (direction !== "deposit" && direction !== "withdraw") {
      return NextResponse.json({ error: "direction harus deposit/withdraw" }, { status: 400 });
    }

    const goals = await query<{ id: string }>(
      "SELECT id FROM savings_goals WHERE id = ? AND user_id = ? AND is_archived = 0",
      [goalId, userId]
    );
    if (goals.length === 0) return NextResponse.json({ error: "Target tidak ditemukan" }, { status: 404 });

    let accountId: string | null = body.account_id ? String(body.account_id) : null;
    if (accountId) {
      const accs = await query<{ id: string }>("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
      if (accs.length === 0) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });
    }

    if (direction === "withdraw") {
      const saved = await query<{ saved: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS saved FROM goal_allocations WHERE goal_id = ? AND user_id = ?",
        [goalId, userId]
      );
      if (Number(saved[0]?.saved ?? 0) < amount) {
        return NextResponse.json({ error: "Saldo target tidak cukup untuk penarikan ini" }, { status: 400 });
      }
    }

    const signed = direction === "deposit" ? amount : -amount;
    const note = body.note ? String(body.note).slice(0, 255) : null;
    const id = uuid();
    await execute(
      `INSERT INTO goal_allocations (id, user_id, goal_id, account_id, amount, allocation_date, note, created_at)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?, NOW())`,
      [id, userId, goalId, accountId, signed, note]
    );
    return NextResponse.json({ id }, { status: 201 });
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
    await execute("DELETE FROM goal_allocations WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
