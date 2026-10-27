import { NextResponse } from "next/server";
import webpush from "web-push";
import { execute, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !process.env.VAPID_SUBJECT) return NextResponse.json({ error: "VAPID env vars missing" }, { status: 503 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, publicKey, privateKey);
  await execute(`CREATE TABLE IF NOT EXISTS bill_reminder_log (bill_id CHAR(36) NOT NULL, reminder_day DATE NOT NULL, PRIMARY KEY (bill_id, reminder_day)) ENGINE=InnoDB`);
  await execute(`CREATE TABLE IF NOT EXISTS push_subscriptions (id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, endpoint TEXT NOT NULL, p256dh VARCHAR(255) NOT NULL, auth VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY push_endpoint (endpoint(191)), KEY push_user (user_id)) ENGINE=InnoDB`);
  const bills = await query<{id:string;user_id:string;title:string;amount:number;due_date:string}>(`SELECT id,user_id,title,amount,due_date FROM bills WHERE is_paid=0 AND due_date IN (CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY))`);
  let sent=0;
  for (const bill of bills) {
    const due = String(bill.due_date).slice(0,10);
    const log = await execute("INSERT IGNORE INTO bill_reminder_log (bill_id,reminder_day) VALUES (?,CURDATE())",[bill.id]);
    if (!log.affectedRows) continue;
    const subs = await query<{id:string;endpoint:string;p256dh:string;auth:string}>("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?",[bill.user_id]);
    for (const sub of subs) {
      try {
        await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:due===new Date().toISOString().slice(0,10)?`Tagihan jatuh tempo: ${bill.title}`:`Tagihan 3 hari lagi: ${bill.title}`,body:`${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(bill.amount))} • jatuh tempo ${due}`,url:"/?section=tagihan"})); sent++;
      } catch (e) { if ((e as {statusCode?:number}).statusCode===404 || (e as {statusCode?:number}).statusCode===410) await execute("DELETE FROM push_subscriptions WHERE id=?",[sub.id]); }
    }
  }
  return NextResponse.json({sent, bills:bills.length});
}
