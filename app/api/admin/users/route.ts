import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await query<{
      id: string; email: string; name: string | null;
      role: string; created_at: string;
    }>(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS account_count,
              (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id) AS transaction_count
       FROM users u ORDER BY u.created_at DESC`
    );
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { id, role } = body;
    if (role !== "admin" && role !== "user") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    await execute("UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?", [role, id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
