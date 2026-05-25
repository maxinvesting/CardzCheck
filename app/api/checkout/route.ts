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

    // Post PR C2b tier names:
    //   - "business"      → CardzCheck Business (base paid)
    //   - "business_pro"  → CardzCheck Business Pro (top paid)
    // Legacy "pro" is accepted and mapped to "business" for backward compat
    // with any clients still posting the old tier name; legacy "business" is
    // now "business_pro" since we renamed the top tier.
    let billing: "monthly" | "annual" = "monthly";
    let tier: "business" | "business_pro" = "business";
    let seatQuantity = 1;
    try {
      const body = await request.json();
      if (body?.billing === "annual") billing = "annual";
      const raw = String(body?.tier ?? "").trim().toLowerCase();
      if (raw === "business_pro" || raw === "business") {
        tier = raw as "business" | "business_pro";
      } else if (raw === "pro") {
        // legacy alias → Business base
        tier = "business";
      }
      if (Number.isFinite(Number(body?.seat_quantity))) {
        seatQuantity = Math.max(1, Math.trunc(Number(body.seat_quantity)));
      }
    } catch {
      // Body may be empty for legacy callers — default to Business base.
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (tier === "business_pro") {
      // TODO(stripe): Once the Business Pro product is created in Stripe,
      // populate STRIPE_BUSINESS_PRO_MONTHLY_PRICE_ID (and optional
      // STRIPE_BUSINESS_PRO_ANNUAL_PRICE_ID). Until then, accept the
      // legacy STRIPE_BUSINESS_MONTHLY_PRICE_ID as a fallback so we can
      // ship the code without waiting on Stripe setup.
      const proPriceConfigured =
        process.env.STRIPE_BUSINESS_PRO_MONTHLY_PRICE_ID?.trim() ||
        process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID?.trim();
      if (!proPriceConfigured) {
        console.error("Checkout: No Business Pro Stripe price IDs configured");
        return NextResponse.json(
          {
            error:
              "Business Pro checkout is not yet configured. Contact support to upgrade.",
            upgradeRequired: true,
          },
          { status: 503 }
        );
      }

      const session = await createBusinessSubscriptionCheckout(
        user.id,
        user.email,
        `${appUrl}/business?success=true`,
        `${appUrl}/business?canceled=true`,
        billing,
        seatQuantity
      );
      return NextResponse.json({ url: session.url });
    }

    // Business (base) checkout. While Stripe products are still being set up,
    // STRIPE_BUSINESS_BASIC_PRICE_ID is the new variable; we fall back to the
    // legacy STRIPE_SUBSCRIPTION_PRICE_ID so existing prices keep working.
    const businessBasicConfigured =
      process.env.STRIPE_BUSINESS_BASIC_PRICE_ID?.trim() ||
      process.env.STRIPE_SUBSCRIPTION_PRICE_ID?.trim() ||
      process.env.STRIPE_ACTIVATION_PRICE_ID?.trim();
    if (!businessBasicConfigured) {
      console.error("Checkout: No Business Stripe price IDs configured");
      return NextResponse.json(
        {
          error:
            "Business checkout is not yet configured. Contact support to upgrade.",
          upgradeRequired: true,
        },
        { status: 503 }
      );
    }

    const session = await createProSubscriptionCheckout(
      user.id,
      user.email,
      `${appUrl}/account?success=true`,
      `${appUrl}/business?canceled=true`,
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
