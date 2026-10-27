import { NextResponse } from "next/server";
import webpush from "web-push";
import { execute, query, uuid } from "@/lib/db";
import { requireUser } from "@/lib/session";

async function ensureTable() {
  await execute(`CREATE TABLE IF NOT EXISTS push_subscriptions (id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, endpoint TEXT NOT NULL, p256dh VARCHAR(255) NOT NULL, auth VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY push_endpoint (endpoint(191)), KEY push_user (user_id)) ENGINE=InnoDB`);
}
export async function GET() {
  return NextResponse.json({ key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "" });
}
export async function POST(req: Request) {
  try {
    const userId = await requireUser(); await ensureTable();
    const { subscription } = await req.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return NextResponse.json({ error: "Data langganan tidak valid" }, { status: 400 });
    await execute("INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),p256dh=VALUES(p256dh),auth=VALUES(auth)", [uuid(), userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function DELETE(req: Request) {
  try {
    const userId = await requireUser(); await ensureTable();
    const { endpoint } = await req.json();
    await execute("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", [userId, endpoint]);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
