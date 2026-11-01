import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const tableNames = ["recurring_rules", "users", "goals", "splits", "debts", "bills", "accounts", "transactions", "categories"];
    const result: Record<string, boolean> = {};
    
    for (const tbl of tableNames) {
      const check = await query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [tbl]
      );
      result[tbl] = (check[0]?.cnt || 0) > 0;
    }
    
    const missing = Object.entries(result).filter(([_, exists]) => !exists).map(([tbl]) => tbl);
    
    return NextResponse.json({
      status: missing.length === 0 ? "ok" : "missing_tables",
      tables: result,
      missing: missing.length > 0 ? missing : undefined
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("[health] error:", e);
    return NextResponse.json({
      status: "error",
      error: "Internal server error"
    }, { status: 500 });
  }
}
