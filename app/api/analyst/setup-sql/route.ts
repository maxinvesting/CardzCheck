import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MIGRATIONS: Record<string, string> = {
  analyst: "20240126_analyst_threads.sql",
  users: "20250201_users_analyst_columns.sql",
};

// Returns a migration SQL so the setup page can offer "Copy SQL".
// ?migration=analyst (default) or ?migration=users
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const migration = searchParams.get("migration") || "analyst";
  const file = MIGRATIONS[migration] || MIGRATIONS.analyst;

  try {
    const filePath = path.join(process.cwd(), "supabase", "migrations", file);
    const sql = fs.readFileSync(filePath, "utf8");
    return new NextResponse(sql, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    console.error("Setup SQL read error:", e);
    return NextResponse.json(
      { error: "Migration file not found" },
      { status: 404 }
    );
  }
}
