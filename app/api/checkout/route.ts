import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProSubscriptionCheckout, createBusinessSubscriptionCheckout } from "@/lib/stripe";

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

    let billing: "monthly" | "annual" = "monthly";
    let tier: "pro" | "business" = "pro";
    try {
      const body = await request.json();
      if (body?.billing === "annual") billing = "annual";
      if (body?.tier === "business") tier = "business";
    } catch {
      // Body may be empty for legacy callers — default to monthly pro
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (tier === "business") {
      const businessPriceConfigured =
        process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID?.trim() ||
        process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID?.trim();
      if (!businessPriceConfigured) {
        console.error("Checkout: No Business Stripe price IDs configured");
        return NextResponse.json(
          { error: "Business checkout is not configured. Please try again later." },
          { status: 503 }
        );
      }

      const session = await createBusinessSubscriptionCheckout(
        user.id,
        user.email,
        `${appUrl}/business?success=true`,
        `${appUrl}/business?canceled=true`,
        billing
      );
      return NextResponse.json({ url: session.url });
    }

    // Pro checkout
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

    const session = await createProSubscriptionCheckout(
      user.id,
      user.email,
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
