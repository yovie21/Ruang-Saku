import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUser();
    const splits = await query<{
      id: string; title: string; total_amount: number; split_date: string;
      note: string | null; account: string | null;
    }>(
      `SELECT s.id, s.title, s.total_amount, s.split_date, s.note, a.name AS account
       FROM splits s
       LEFT JOIN accounts a ON a.id = s.account_id
       WHERE s.user_id = ?
       ORDER BY s.split_date DESC, s.created_at DESC LIMIT 50`,
      [userId]
    );
    const ids = splits.map(s => s.id);
    let members: { id: string; split_id: string; name: string; share_amount: number; paid_amount: number }[] = [];
    if (ids.length > 0) {
      members = await query(
        `SELECT id, split_id, name, share_amount, paid_amount FROM split_members WHERE split_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
        ids
      );
    }
    const bySplit = new Map<string, typeof members>();
    for (const m of members) {
      const list = bySplit.get(m.split_id) ?? [];
      list.push(m);
      bySplit.set(m.split_id, list);
    }
    return NextResponse.json(splits.map(s => {
      const ms = bySplit.get(s.id) ?? [];
      const shared = ms.reduce((a, m) => a + Number(m.share_amount), 0);
      const paid = ms.reduce((a, m) => a + Number(m.paid_amount), 0);
      return { ...s, members: ms, shared, paid, remaining: Math.max(0, shared - paid) };
    }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const title = String(body.title || "").trim().slice(0, 200);
    const total = Number(body.total_amount);
    if (!title) return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 });
    if (!total || total <= 0) return NextResponse.json({ error: "Total harus > 0" }, { status: 400 });
    const members: { name: string; share?: number; paid?: number }[] = Array.isArray(body.members) ? body.members : [];
    const clean = members.map(m => String(m.name || "").trim()).filter(Boolean);
    if (clean.length === 0) return NextResponse.json({ error: "Isi minimal 1 teman patungan" }, { status: 400 });

    let accountId: string | null = body.account_id ? String(body.account_id) : null;
    if (accountId) {
      const accs = await query<{ id: string }>("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
      if (accs.length === 0) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });
    }

    let perPerson: number[] = [];
    const shares = members.map(m => Number(m.share));
    if (shares.every(s => s && s > 0)) {
      perPerson = shares as number[];
    } else {
      const n = clean.length + 1; // + saya sendiri
      const each = Math.floor(total / n);
      perPerson = clean.map((_, i) => (i === clean.length - 1 ? total - each * (n - 1) + 0 : each));
      // bagian saya = each, bagian teman terakhir menampung sisa pembulatan
    }

    const id = uuid();
    const date = body.split_date ? String(body.split_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    await execute(
      `INSERT INTO splits (id, user_id, title, total_amount, split_date, account_id, transaction_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [id, userId, title, total, date, accountId, body.transaction_id ? String(body.transaction_id) : null, body.note ? String(body.note).slice(0, 255) : null]
    );
    for (let i = 0; i < clean.length; i++) {
      await execute(
        `INSERT INTO split_members (id, split_id, user_id, name, share_amount, paid_amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuid(), id, userId, clean[i].slice(0, 120), perPerson[i], Number(members[i]?.paid) > 0 ? Number(members[i].paid) : 0]
      );
    }
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

    const owned = await query<{ id: string }>("SELECT id FROM splits WHERE id = ? AND user_id = ?", [id, userId]);
    if (owned.length === 0) return NextResponse.json({ error: "Patungan tidak ditemukan" }, { status: 404 });

    const sets: string[] = ["updated_at = NOW()"];
    const params: (string | number | null)[] = [];
    if (body.title !== undefined) {
      const title = String(body.title).trim().slice(0, 200);
      if (!title) return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 });
      sets.push("title = ?"); params.push(title);
    }
    if (body.total_amount !== undefined) {
      const total = Number(body.total_amount);
      if (!total || total <= 0) return NextResponse.json({ error: "Total harus > 0" }, { status: 400 });
      sets.push("total_amount = ?"); params.push(total);
    }
    if (body.split_date !== undefined) {
      const d = body.split_date ? String(body.split_date).slice(0, 10) : null;
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return NextResponse.json({ error: "Format tanggal tidak valid" }, { status: 400 });
      sets.push("split_date = ?"); params.push(d);
    }
    if (body.note !== undefined) {
      sets.push("note = ?"); params.push(body.note ? String(body.note).slice(0, 255) : null);
    }
    if (body.account_id !== undefined) {
      const accountId = body.account_id ? String(body.account_id) : null;
      if (accountId) {
        const accs = await query<{ id: string }>("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
        if (accs.length === 0) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 400 });
      }
      sets.push("account_id = ?"); params.push(accountId);
    }
    if (sets.length > 1) {
      params.push(id, userId);
      await execute(`UPDATE splits SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
    }

    // Ganti daftar anggota bila dikirim (nama saja; porsi dihitung ulang proporsional
    // terhadap total baru dengan rasio lama, pembayaran yang sudah masuk dipertahankan).
    if (body.members !== undefined) {
      const members: { name: string }[] = Array.isArray(body.members) ? body.members : [];
      const clean = members.map(m => String(m.name || "").trim()).filter(Boolean).slice(0, 20);
      if (clean.length === 0) return NextResponse.json({ error: "Isi minimal 1 teman patungan" }, { status: 400 });
      const old = await query<{ id: string; name: string; share_amount: number; paid_amount: number }>(
        "SELECT id, name, share_amount, paid_amount FROM split_members WHERE split_id = ? ORDER BY created_at",
        [id]
      );
      const totalRow = await query<{ total_amount: number }>("SELECT total_amount FROM splits WHERE id = ?", [id]);
      const total = Number(totalRow[0]?.total_amount ?? 0);
      const oldTotal = old.reduce((s, m) => s + Number(m.share_amount), 0);
      const paidByName = new Map(old.map(m => [m.name.toLowerCase(), Number(m.paid_amount) || 0]));
      await execute("DELETE FROM split_members WHERE split_id = ?", [id]);
      const n = clean.length + 1;
      const each = Math.floor(total / n);
      for (let i = 0; i < clean.length; i++) {
        // Pertahankan rasio lama bila nama masih ada, selainnya porsi rata.
        const oldShare = old.find(m => m.name.toLowerCase() === clean[i].toLowerCase());
        const share = oldShare && oldTotal > 0
          ? Math.round((Number(oldShare.share_amount) / oldTotal) * total)
          : (i === clean.length - 1 ? total - each * (n - 1) : each);
        const paid = Math.min(share, paidByName.get(clean[i].toLowerCase()) ?? 0);
        await execute(
          `INSERT INTO split_members (id, split_id, user_id, name, share_amount, paid_amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [uuid(), id, userId, clean[i].slice(0, 120), Math.max(0, share), paid]
        );
      }
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
    await execute("DELETE FROM splits WHERE id = ? AND user_id = ?", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
