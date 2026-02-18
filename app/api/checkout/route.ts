import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProSubscriptionCheckout } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Please sign in to upgrade." },
        { status: 401 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      console.error("Checkout: STRIPE_SECRET_KEY is not set");
      return NextResponse.json(
        { error: "Checkout is not configured. Please try again later." },
        { status: 503 }
      );
    }

    const hasSubscriptionPrices =
      process.env.STRIPE_ACTIVATION_PRICE_ID?.trim() ||
      process.env.STRIPE_SUBSCRIPTION_PRICE_ID?.trim();
    if (!hasSubscriptionPrices && !process.env.NEXT_PUBLIC_STRIPE_PRICE_ID?.trim()) {
      console.error("Checkout: No Stripe price IDs configured");
      return NextResponse.json(
        { error: "Checkout is not configured. Please try again later." },
        { status: 503 }
      );
    }

    // Parse billing preference from request body
    let billing: "monthly" | "annual" = "monthly";
    try {
      const body = await request.json();
      if (body?.billing === "annual") billing = "annual";
    } catch {
      // Body may be empty for legacy callers — default to monthly
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await createProSubscriptionCheckout(
      user.id,
      user.email!,
      `${appUrl}/account?success=true`,
      `${appUrl}/comps?canceled=true`,
      billing
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
