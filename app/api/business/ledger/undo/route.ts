import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import {
  getLatestLedgerAction,
  undoLedgerAction,
} from "@/lib/business/ledger-actions";

export const dynamic = "force-dynamic";

async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, context: null };

  const context = await requireBusinessAccess(user.id);
  return { supabase, user, context };
}

export async function GET(): Promise<NextResponse> {
  try {
    const { supabase, user, context } = await getSessionContext();
    if (!user || !context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, needsMigration } = await getLatestLedgerAction({
      supabase,
      userId: user.id,
      businessAccountId: context.businessAccountId,
    });

    return NextResponse.json({
      action: action
        ? {
            id: action.id,
            type: action.action_type,
            label: action.label,
            created_at: action.created_at,
          }
        : null,
      needs_migration: needsMigration,
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message =
      error instanceof Error ? error.message : "Failed to load undo state";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const { supabase, user, context } = await getSessionContext();
    if (!user || !context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, needsMigration } = await getLatestLedgerAction({
      supabase,
      userId: user.id,
      businessAccountId: context.businessAccountId,
    });

    if (needsMigration) {
      return NextResponse.json(
        { error: "Ledger undo migration required", needs_migration: true },
        { status: 503 }
      );
    }

    if (!action) {
      return NextResponse.json({ undone: false, action: null });
    }

    await undoLedgerAction({
      supabase,
      userId: user.id,
      context,
      action,
    });

    return NextResponse.json({
      undone: true,
      action: {
        id: action.id,
        type: action.action_type,
        label: action.label,
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message =
      error instanceof Error ? error.message : "Failed to undo ledger action";
    return NextResponse.json({ error: message }, { status });
  }
}
