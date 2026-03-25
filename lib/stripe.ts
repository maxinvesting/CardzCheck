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
 * Create Pro subscription checkout. Supports monthly and annual billing.
 */
export async function createProSubscriptionCheckout(
  userId: string,
  userEmail: string,
  successUrl: string,
  cancelUrl: string,
  billing: "monthly" | "annual" = "monthly"
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

  // $20 one-time activation fee (if price ID is set, monthly only)
  if (billing === "monthly") {
    const activationPriceId = process.env.STRIPE_ACTIVATION_PRICE_ID;
    if (activationPriceId) {
      lineItems.push({ price: activationPriceId, quantity: 1 });
    }
  }

  // Pick recurring price based on billing interval
  const subscriptionPriceId =
    billing === "annual"
      ? (process.env.STRIPE_ANNUAL_PRICE_ID || process.env.STRIPE_SUBSCRIPTION_PRICE_ID)
      : process.env.STRIPE_SUBSCRIPTION_PRICE_ID;

  if (subscriptionPriceId) {
    lineItems.push({ price: subscriptionPriceId, quantity: 1 });
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
    metadata: { userId },
    subscription_data: { metadata: { userId } },
  });

  return session;
}

/**
 * Create Business subscription checkout (monthly seats pricing).
 */
export async function createBusinessSubscriptionCheckout(
  userId: string,
  userEmail: string,
  successUrl: string,
  cancelUrl: string,
  _billing: "monthly" | "annual" = "monthly",
  seatQuantity = 1
) {
  const stripe = getStripeClient();

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

  // Business seats are monthly only. Keep billing arg for backward compatibility.
  const priceId = process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID;

  if (!priceId) {
    throw new Error("Business price ID not configured");
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: Math.max(1, Math.trunc(seatQuantity)) }],
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      tier: "business",
      billing_interval: "monthly",
      seat_quantity: String(Math.max(1, Math.trunc(seatQuantity))),
    },
    subscription_data: {
      metadata: {
        userId,
        tier: "business",
        billing_interval: "monthly",
        seat_quantity: String(Math.max(1, Math.trunc(seatQuantity))),
      },
    },
  });

  return session;
}

export interface ShopCheckoutItem {
  listingId: string;
  quantity: number;
  price: number;
  shippingCost: number;
  playerName: string;
  year: number;
  setBrand: string;
  grade: string;
}

export interface ShopCheckoutOptions {
  /** Business plan members get free shipping on all Deals orders. */
  businessFreeShipping?: boolean;
}

/**
 * Create a Stripe Checkout session for shop (one-time payment).
 * Prices and shipping come from DB; never trust client.
 * Business subscribers get free shipping applied server-side via options.businessFreeShipping.
 */
export async function createShopCheckoutSession(
  items: ShopCheckoutItem[],
  successUrl: string,
  cancelUrl: string,
  options?: ShopCheckoutOptions
) {
  const stripe = getStripeClient();
  const freeShipping = options?.businessFreeShipping ?? false;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const item of items) {
    const unitPrice = item.price + (freeShipping ? 0 : item.shippingCost);
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: `${item.playerName} ${item.year} ${item.setBrand} - ${item.grade}`,
          description: freeShipping
            ? "Business plan: free shipping applied"
            : item.quantity > 1
            ? `Quantity: ${item.quantity}`
            : undefined,
        },
        unit_amount: Math.round(unitPrice * 100), // cents
      },
      quantity: item.quantity,
    });
  }

  const listingIds = items.map((i) => i.listingId);
  const quantities = items.map((i) => i.quantity);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      listingIds: JSON.stringify(listingIds),
      quantities: JSON.stringify(quantities),
      businessFreeShipping: freeShipping ? "true" : "false",
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
