import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Check if recurring_rules table exists
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = 'recurring_rules'`
    );
    
    const recurringExists = tables.length > 0;
    
    // Check if users table exists
    const userTables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = 'users'`
    );
    
    const usersExists = userTables.length > 0;
    
    return NextResponse.json({
      status: "ok",
      tables: {
        recurring_rules: recurringExists,
        users: usersExists
      }
    });
  } catch (e) {
    console.error("[health] error:", e);
    return NextResponse.json({
      status: "error",
      error: (e as Error).message
    }, { status: 500 });
  }
}
