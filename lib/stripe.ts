import Stripe from "stripe";

function getStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-02-24.acacia",
  });
}

export { getStripeClient as stripe };

export async function createCheckoutSession(
  userId: string,
  userEmail: string,
  successUrl: string,
  cancelUrl: string
) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    customer_email: userEmail,
    payment_method_types: ["card"],
    line_items: [
      {
        price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
    },
  });

  return session;
}
