/**
 * eBay Marketplace Notification Webhook
 *
 * GET  — eBay challenge/response verification (one-time setup, required by eBay)
 * POST — Incoming eBay notifications (order events, account deletion)
 *
 * eBay notification topics handled:
 *   MARKETPLACE_ACCOUNT_DELETION  — GDPR/compliance requirement
 *   ITEM_SOLD                     — order confirmed/paid
 *
 * Verification: eBay sends a SHA256 HMAC of the notification payload using
 * EBAY_VERIFICATION_TOKEN. We verify before processing.
 *
 * Docs: https://developer.ebay.com/api-docs/commerce/notification/overview.html
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import {
  handleEbayOrderSold,
  handleMarketplaceAccountDeletion,
} from "@/lib/ebay/selling/event-handlers";
import { getOrder } from "@/lib/ebay/selling/fulfillment-api";
import { businessInventoryProvider } from "@/lib/inventory/business-inventory-provider";

export const dynamic = "force-dynamic";

// eBay sends the challenge as a query param for endpoint verification
export async function GET(req: NextRequest): Promise<NextResponse> {
  const challengeCode = req.nextUrl.searchParams.get("challenge_code");
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_NOTIFICATION_ENDPOINT ?? `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/ebay`;

  if (!challengeCode || !verificationToken) {
    return NextResponse.json({ error: "Missing challenge_code or EBAY_VERIFICATION_TOKEN" }, { status: 400 });
  }

  // eBay's required hash: SHA256(challengeCode + verificationToken + endpoint)
  const hash = crypto
    .createHash("sha256")
    .update(challengeCode + verificationToken + endpoint)
    .digest("hex");

  return NextResponse.json({ challengeResponse: hash });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  if (!verificationToken) {
    console.error("[ebay/webhook] EBAY_VERIFICATION_TOKEN not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify eBay HMAC-SHA256 signature.
  // SECURITY: Both the presence and validity of the signature are required.
  // Accepting requests without a signature would allow anyone to inject fake
  // eBay events (e.g., fake order-sold or account-deletion notifications).
  const signatureHeader = req.headers.get("x-ebay-signature");
  if (!signatureHeader) {
    console.warn("[ebay/webhook] Request received without x-ebay-signature header — rejecting");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const expectedSig = crypto
    .createHmac("sha256", verificationToken)
    .update(rawBody)
    .digest("base64");

  if (signatureHeader !== expectedSig) {
    console.warn("[ebay/webhook] Signature mismatch — possible replay or spoofed request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = (payload.metadata as any)?.topic as string | undefined;
  const notification = payload.notification as Record<string, unknown> | undefined;

  try {
    if (topic === "MARKETPLACE_ACCOUNT_DELETION") {
      const ebayUserId = (notification?.data as any)?.userId as string | undefined;
      if (ebayUserId) {
        await handleMarketplaceAccountDeletion(ebayUserId);
      }
      return NextResponse.json({ processed: true });
    }

    if (topic === "ITEM_SOLD" || topic === "ORDER_PAID") {
      const orderId = (notification?.data as any)?.orderId as string | undefined;
      const ebayUserId = (notification?.data as any)?.userId as string | undefined;

      if (!orderId || !ebayUserId) {
        console.warn("[ebay/webhook] Missing orderId or userId in ITEM_SOLD notification");
        return NextResponse.json({ processed: false, reason: "missing_fields" });
      }

      // Find the CardzCheck user by their eBay user ID
      const supabase = await createClient();
      const { data: accounts } = await supabase
        .from("ebay_accounts")
        .select("user_id")
        .eq("ebay_user_id", ebayUserId)
        .eq("is_active", true);

      if (!accounts || accounts.length === 0) {
        // Order for a user who doesn't have CardzCheck connected — safe to ignore
        return NextResponse.json({ processed: false, reason: "user_not_found" });
      }

      if (accounts.length > 1) {
        console.error("[ebay-webhook] Multiple CardzCheck accounts share eBay user ID — skipping", { ebayUserId });
        return NextResponse.json({ processed: true }); // ambiguous, skip safely
      }

      const account = accounts[0];

      // Fetch full order details from Fulfillment API
      const order = await getOrder(account.user_id, orderId);

      if (order.orderPaymentStatus !== "PAID") {
        return NextResponse.json({ processed: false, reason: "not_paid" });
      }

      const { created, saleId } = await handleEbayOrderSold(
        account.user_id,
        order,
        businessInventoryProvider
      );

      return NextResponse.json({ processed: true, created, saleId });
    }

    // Unknown topic — acknowledge to prevent eBay retries
    return NextResponse.json({ processed: false, reason: `unknown_topic:${topic}` });
  } catch (err) {
    console.error("[ebay/webhook] processing error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    // Return 200 anyway — returning 5xx causes eBay to retry indefinitely
    return NextResponse.json({ processed: false, error: message });
  }
}
