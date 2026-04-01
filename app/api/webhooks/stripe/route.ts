import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { logDebug, redactId } from "@/lib/logging";

function toIso(epochSeconds: number | null | undefined): string | null {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

function normalizeBusinessStatus(status: string): string {
  const normalized = (status || "").toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "trialing") return "trialing";
  if (normalized === "past_due") return "past_due";
  return "canceled";
}

function getSeatQuantityFromSubscription(subscription: Stripe.Subscription): {
  seatQuantity: number;
  subscriptionItemId: string | null;
} {
  const configuredBusinessPriceId = process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || "";
  const matched =
    subscription.items.data.find((item) =>
      configuredBusinessPriceId ? item.price.id === configuredBusinessPriceId : true
    ) ?? subscription.items.data[0];

  return {
    seatQuantity: Math.max(1, matched?.quantity ?? 1),
    subscriptionItemId: matched?.id ?? null,
  };
}

function isBusinessSubscription(subscription: Stripe.Subscription): boolean {
  if (subscription.metadata?.tier === "business") return true;
  const configuredBusinessPriceId = process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || "";
  if (!configuredBusinessPriceId) return false;
  return subscription.items.data.some(
    (item) => item.price.id === configuredBusinessPriceId
  );
}

async function ensureOwnerMembership(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  ownerUserId: string,
  businessAccountId: string
) {
  await supabase.from("business_memberships").upsert(
    {
      business_account_id: businessAccountId,
      user_id: ownerUserId,
      role: "owner",
      status: "active",
      invited_by: ownerUserId,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "business_account_id,user_id" }
  );
}

async function syncBusinessAccountFromSubscription(args: {
  supabase: Awaited<ReturnType<typeof createServiceClient>>;
  ownerUserId: string;
  stripeCustomerId: string | null;
  subscription: Stripe.Subscription;
}) {
  const { supabase, ownerUserId, stripeCustomerId, subscription } = args;
  const seatInfo = getSeatQuantityFromSubscription(subscription);

  await supabase.from("business_accounts").upsert(
    {
      owner_user_id: ownerUserId,
      billing_interval: "monthly",
      subscription_status: normalizeBusinessStatus(subscription.status),
      current_period_end: toIso(subscription.current_period_end),
      stripe_customer_id: stripeCustomerId ?? null,
      stripe_subscription_id: subscription.id,
      stripe_subscription_item_id: seatInfo.subscriptionItemId,
      seat_quantity: seatInfo.seatQuantity,
    },
    { onConflict: "owner_user_id" }
  );

  const { data: accountRow } = await supabase
    .from("business_accounts")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .single();

  if (accountRow?.id) {
    await ensureOwnerMembership(supabase, ownerUserId, accountRow.id);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Webhook: STRIPE_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }
    const stripeClient = stripe();
    event = stripeClient.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const supabase = await createServiceClient();

  // Idempotency: skip already-processed events to prevent duplicate side effects on Stripe retries
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existingEvent) {
    logDebug("Stripe webhook event already processed, skipping", { eventId: event.id });
    return NextResponse.json({ received: true, skipped: true });
  }

  await supabase.from("webhook_events").insert({
    provider: "stripe",
    event_id: event.id,
    event_type: event.type,
    processed_at: new Date().toISOString(),
  });

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (!userId) {
        console.error("No userId in session metadata");
        break;
      }

      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string | null;

      // Determine tier from metadata (defaults to "pro" for backward compatibility)
      const tier = session.metadata?.tier === "business" ? "business" : "pro";
      const stripeClient = stripe();
      let stripeSubscription: Stripe.Subscription | null = null;
      if (subscriptionId) {
        stripeSubscription = await stripeClient.subscriptions.retrieve(subscriptionId);
      }

      // Create or update subscription record
      const { error: subError } = await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          tier,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          activation_paid: true,
          current_period_end: toIso(stripeSubscription?.current_period_end),
          status: "active",
        },
        { onConflict: "user_id" }
      );

      if (subError) {
        console.error("Error creating subscription:", subError);
      }

      // Update legacy is_paid flag for backward compatibility
      const { error: userError } = await supabase
        .from("users")
        .update({
          is_paid: true,
          stripe_customer_id: customerId,
        })
        .eq("id", userId);

      if (userError) {
        console.error("Error updating user:", userError);
        return NextResponse.json(
          { error: "Failed to update user" },
          { status: 500 }
        );
      }

      // Initialize or reset usage tracking
      await supabase.from("usage").upsert(
        {
          user_id: userId,
          searches_used: 0,
          ai_messages_used: 0,
          last_reset: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (tier === "business" && stripeSubscription) {
        try {
          await syncBusinessAccountFromSubscription({
            supabase,
            ownerUserId: userId,
            stripeCustomerId: customerId,
            subscription: stripeSubscription,
          });
        } catch (syncError) {
          console.error("Failed to sync business account on checkout completion", syncError);
        }
      }

      logDebug("User upgraded", { userId: redactId(userId), tier });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;

      if (!subscriptionId) {
        logDebug("Invoice paid but no subscription ID");
        break;
      }

      // Get subscription details from Stripe
      const stripeClient = stripe();
      const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
      const subTier = isBusinessSubscription(subscription) ? "business" : "pro";

      // Find the subscription record by stripe_subscription_id
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (existingSub) {
        // Update subscription period and status
        await supabase
          .from("subscriptions")
          .update({
            tier: subTier,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            status: "active",
          })
          .eq("stripe_subscription_id", subscriptionId);

        // Reset monthly usage on renewal (if this is not the first invoice)
        if (invoice.billing_reason === "subscription_cycle") {
          await supabase
            .from("usage")
            .update({
              searches_used: 0,
              ai_messages_used: 0,
              last_reset: new Date().toISOString(),
            })
            .eq("user_id", existingSub.user_id);

          logDebug("Usage reset on subscription renewal", {
            userId: redactId(existingSub.user_id),
          });
        }

        if (subTier === "business") {
          try {
            await syncBusinessAccountFromSubscription({
              supabase,
              ownerUserId: existingSub.user_id,
              stripeCustomerId: (invoice.customer as string) || null,
              subscription,
            });
          } catch (syncError) {
            console.error("Failed to sync business account on invoice.paid", syncError);
          }
        }
      }

      logDebug("Invoice paid for subscription", {
        subscriptionId: redactId(subscriptionId),
        tier: subTier,
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;

      if (!subscriptionId) {
        logDebug("Invoice payment failed but no subscription ID");
        break;
      }

      // Update subscription status to past_due
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", subscriptionId);

      await supabase
        .from("business_accounts")
        .update({ subscription_status: "past_due" })
        .eq("stripe_subscription_id", subscriptionId);

      if (error) {
        console.error("Error updating subscription status:", error);
      }

      logDebug("Payment failed for subscription", {
        subscriptionId: redactId(subscriptionId),
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const wasBusiness = isBusinessSubscription(subscription);

      // Find the user by subscription ID
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (sub) {
        // Update subscription to canceled/free tier
        await supabase
          .from("subscriptions")
          .update({
            tier: wasBusiness ? "business" : "free",
            status: "canceled",
            current_period_end: toIso(subscription.current_period_end),
          })
          .eq("stripe_subscription_id", subscription.id);

        // Update legacy is_paid flag
        await supabase
          .from("users")
          .update({ is_paid: false })
          .eq("id", sub.user_id);

        logDebug("Subscription canceled for user", {
          userId: redactId(sub.user_id),
        });
      }

      await supabase
        .from("business_accounts")
        .update({
          subscription_status: "canceled",
          current_period_end: toIso(subscription.current_period_end),
        })
        .eq("stripe_subscription_id", subscription.id);

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      // Detect tier from subscription metadata or price IDs
      const subTier = isBusinessSubscription(subscription) ? "business" : "pro";

      await supabase
        .from("subscriptions")
        .update({
          tier: subTier,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          status:
            subscription.status === "active" || subscription.status === "trialing"
              ? "active"
              : "past_due",
        })
        .eq("stripe_subscription_id", subscription.id);

      if (subTier === "business") {
        const { data: ownerRow } = await supabase
          .from("subscriptions")
          .select("user_id, stripe_customer_id")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();

        if (ownerRow?.user_id) {
          try {
            await syncBusinessAccountFromSubscription({
              supabase,
              ownerUserId: ownerRow.user_id,
              stripeCustomerId: ownerRow.stripe_customer_id ?? null,
              subscription,
            });
          } catch (syncError) {
            console.error(
              "Failed to sync business account on subscription.updated",
              syncError
            );
          }
        } else {
          await supabase
            .from("business_accounts")
            .update({
              subscription_status: normalizeBusinessStatus(subscription.status),
              current_period_end: toIso(subscription.current_period_end),
            })
            .eq("stripe_subscription_id", subscription.id);
        }
      } else {
        await supabase
          .from("business_accounts")
          .update({
            subscription_status: normalizeBusinessStatus(subscription.status),
            current_period_end: toIso(subscription.current_period_end),
          })
          .eq("stripe_subscription_id", subscription.id);
      }

      logDebug("Subscription updated", {
        subscriptionId: redactId(subscription.id),
        tier: subTier,
      });
      break;
    }

    default:
      logDebug("Unhandled event type", { eventType: event.type });
  }

  return NextResponse.json({ received: true });
}
