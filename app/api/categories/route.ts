import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const withUsage = searchParams.get("usage") === "1";
    let sql = withUsage
      ? `SELECT c.id, c.name, c.type, c.icon, c.color, c.is_default,
                (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id AND t.user_id = ?) AS usage_count
         FROM categories c WHERE c.user_id = ? AND c.is_archived = 0`
      : "SELECT id, name, type, icon, color, is_default FROM categories WHERE user_id = ? AND is_archived = 0";
    const params: (string | number | null)[] = withUsage ? [userId, userId] : [userId];
    if (type) { sql += withUsage ? " AND c.type = ?" : " AND type = ?"; params.push(type); }
    sql += withUsage ? " ORDER BY c.is_default DESC, c.name" : " ORDER BY is_default DESC, name";
    const rows = await query(sql, params);
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const name = String(body.name || "").trim().slice(0, 80);
    const type = String(body.type || "expense");
    if (!name) return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
    if (type !== "income" && type !== "expense") return NextResponse.json({ error: "Tipe tidak valid" }, { status: 400 });
    const color = typeof body.color === "string" && HEX.test(body.color) ? body.color : null;
    try {
      await execute(
        `INSERT INTO categories (id, user_id, name, type, icon, color, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, FALSE, NOW(), NOW())`,
        [uuid(), userId, name, type, color]
      );
    } catch (e) {
      if (String((e as Error).message).includes("Duplicate")) {
        return NextResponse.json({ error: "Kategori dengan nama itu sudah ada" }, { status: 400 });
      }
      throw e;
    }
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
    const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) : undefined;
    if (name !== undefined && !name) return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
    const color = body.color === null || body.color === "" ? null : (typeof body.color === "string" && HEX.test(body.color) ? body.color : undefined);
    if (body.color !== undefined && color === undefined && body.color !== null && body.color !== "") {
      return NextResponse.json({ error: "Warna tidak valid (pakai #rrggbb)" }, { status: 400 });
    }
    const sets: string[] = ["updated_at = NOW()"];
    const params: (string | number | null)[] = [];
    if (name !== undefined) { sets.push("name = ?"); params.push(name); }
    if (color !== undefined) { sets.push("color = ?"); params.push(color); }
    if (sets.length === 1) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
    params.push(id, userId);
    try {
      const res = await execute(`UPDATE categories SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
      if (res.affectedRows === 0) return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
    } catch (e) {
      if (String((e as Error).message).includes("Duplicate")) {
        return NextResponse.json({ error: "Kategori dengan nama itu sudah ada" }, { status: 400 });
      }
      throw e;
    }
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
    const used = await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM transactions WHERE category_id = ? AND user_id = ?",
      [id, userId]
    );
    if (Number(used[0]?.n ?? 0) > 0) {
      await execute("UPDATE categories SET is_archived = 1, updated_at = NOW() WHERE id = ? AND user_id = ?", [id, userId]);
      return NextResponse.json({ ok: true, archived: true });
    }
    await execute("DELETE FROM categories WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
