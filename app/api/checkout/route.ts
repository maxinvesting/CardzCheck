import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProSubscriptionCheckout } from "@/lib/stripe";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Use new subscription-based checkout ($20 activation + $5/month)
    const session = await createProSubscriptionCheckout(
      user.id,
      user.email!,
      `${appUrl}/account?success=true`,
      `${appUrl}/search?canceled=true`
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
