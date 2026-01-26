import Stripe from "stripe";

function getStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-02-24.acacia",
  });
}

export { getStripeClient as stripe };

/**
 * Legacy one-time payment checkout (deprecated, kept for backward compatibility)
 */
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

/**
 * Create Pro subscription checkout with $20 activation + $5/month recurring
 */
export async function createProSubscriptionCheckout(
  userId: string,
  userEmail: string,
  successUrl: string,
  cancelUrl: string
) {
  const stripe = getStripeClient();

  // Create or retrieve customer
  let customerId: string;
  const existingCustomers = await stripe.customers.list({
    email: userEmail,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    customerId = existingCustomers.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { userId },
    });
    customerId = customer.id;
  }

  // Build line items for activation fee + subscription
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  // $20 one-time activation fee (if price ID is set)
  const activationPriceId = process.env.STRIPE_ACTIVATION_PRICE_ID;
  if (activationPriceId) {
    lineItems.push({
      price: activationPriceId,
      quantity: 1,
    });
  }

  // $5/month recurring subscription
  const subscriptionPriceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
  if (subscriptionPriceId) {
    lineItems.push({
      price: subscriptionPriceId,
      quantity: 1,
    });
  }

  // Fallback to legacy one-time payment if subscription prices not configured
  if (lineItems.length === 0) {
    return createCheckoutSession(userId, userEmail, successUrl, cancelUrl);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
    },
    subscription_data: {
      metadata: {
        userId,
      },
    },
  });

  return session;
}

/**
 * Create a Stripe Customer Portal session for subscription management
 */
export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
) {
  const stripe = getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}
