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

    if (!user.email) {
      return NextResponse.json(
        { error: "An email address is required for checkout. Please update your account." },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      console.error("Checkout: STRIPE_SECRET_KEY is not set");
      return NextResponse.json(
        { error: "Checkout is not configured. Please try again later." },
        { status: 503 }
      );
    }

    // Single-plan model: one $19.99/mo subscription with a 7-day free trial.
    // The request body is ignored (no tiers, seats, or billing intervals) —
    // every caller gets the same plan.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const priceConfigured = process.env.STRIPE_SUBSCRIPTION_PRICE_ID?.trim();
    if (!priceConfigured) {
      console.error("Checkout: STRIPE_SUBSCRIPTION_PRICE_ID is not configured");
      return NextResponse.json(
        {
          error: "Checkout is not yet configured. Contact support to upgrade.",
          upgradeRequired: true,
        },
        { status: 503 }
      );
    }

    const session = await createProSubscriptionCheckout(
      user.id,
      user.email,
      `${appUrl}/account?success=true`,
      `${appUrl}/account?canceled=true`
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
