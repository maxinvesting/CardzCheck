import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import Stripe from "stripe";

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
    const stripeClient = stripe();
    event = stripeClient.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const supabase = await createServiceClient();

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

      // Create or update subscription record
      const { error: subError } = await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          tier: "pro",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          activation_paid: true,
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

      console.log(`User ${userId} upgraded to Pro`);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;

      if (!subscriptionId) {
        console.log("Invoice paid but no subscription ID");
        break;
      }

      // Get subscription details from Stripe
      const stripeClient = stripe();
      const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);

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

          console.log(`Usage reset for user ${existingSub.user_id} on subscription renewal`);
        }
      }

      console.log(`Invoice paid for subscription ${subscriptionId}`);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;

      if (!subscriptionId) {
        console.log("Invoice payment failed but no subscription ID");
        break;
      }

      // Update subscription status to past_due
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", subscriptionId);

      if (error) {
        console.error("Error updating subscription status:", error);
      }

      console.log(`Payment failed for subscription ${subscriptionId}`);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

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
            tier: "free",
            status: "canceled",
          })
          .eq("stripe_subscription_id", subscription.id);

        // Update legacy is_paid flag
        await supabase
          .from("users")
          .update({ is_paid: false })
          .eq("id", sub.user_id);

        console.log(`Subscription canceled for user ${sub.user_id}`);
      }

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      // Update subscription period end
      await supabase
        .from("subscriptions")
        .update({
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          status: subscription.status === "active" ? "active" : "past_due",
        })
        .eq("stripe_subscription_id", subscription.id);

      console.log(`Subscription updated: ${subscription.id}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
