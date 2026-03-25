import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateBusinessSeats } from "@/lib/business/team-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { seat_quantity?: number };
    const seatQuantity = Number(body.seat_quantity);
    if (!Number.isFinite(seatQuantity) || seatQuantity < 1) {
      return NextResponse.json(
        { error: "seat_quantity must be a positive number" },
        { status: 400 }
      );
    }

    const result = await updateBusinessSeats({
      actorUserId: user.id,
      seatQuantity,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update seats";
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

