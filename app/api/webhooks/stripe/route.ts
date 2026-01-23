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

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (!userId) {
        console.error("No userId in session metadata");
        break;
      }

      // Update user to paid status
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("users")
        .update({
          is_paid: true,
          stripe_customer_id: session.customer as string,
        })
        .eq("id", userId);

      if (error) {
        console.error("Error updating user:", error);
        return NextResponse.json(
          { error: "Failed to update user" },
          { status: 500 }
        );
      }

      console.log(`User ${userId} upgraded to paid`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
