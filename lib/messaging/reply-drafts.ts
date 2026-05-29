import { formatPrice } from "@/lib/pricing";
import type { Message, MessageThread, NegotiationAnalysis } from "./types";

export const MARKETPLACE_REPLY_ACTIONS = [
  {
    id: "smart_reply",
    label: "Smart reply",
    description: "Best all-around reply for the current thread.",
  },
  {
    id: "counteroffer",
    label: "Counteroffer",
    description: "Move the buyer toward a stronger number.",
  },
  {
    id: "hold_firm",
    label: "Hold firm",
    description: "Keep price discipline without killing the deal.",
  },
  {
    id: "decline",
    label: "Polite decline",
    description: "Pass cleanly and leave the door open if it helps.",
  },
  {
    id: "accept_close",
    label: "Accept & close",
    description: "Lock the deal in and ask them to complete payment.",
  },
  {
    id: "ask_payment",
    label: "Ask payment",
    description: "Nudge a ready buyer to send payment now.",
  },
  {
    id: "ask_time",
    label: "Buy time",
    description: "Keep the deal warm while you need a little time.",
  },
  {
    id: "reengage",
    label: "Re-engage",
    description: "Wake up a stale buyer without sounding needy.",
  },
  {
    id: "clarify",
    label: "Clarify details",
    description: "Clear up condition, shipping, or price questions.",
  },
] as const;

export type MarketplaceReplyAction = (typeof MARKETPLACE_REPLY_ACTIONS)[number]["id"];

export type MarketplaceConversationStage =
  | "new_inquiry"
  | "negotiating"
  | "near_close"
  | "stale"
  | "post_sale"
  | "resolved";

export type MarketplaceReplySource = "ai" | "fallback";

export interface MarketplaceDealContext {
  askingPriceCents: number | null;
  latestOfferCents: number | null;
  suggestedCounterCents: number | null;
  estimatedNetCents: number | null;
  estimatedProfitCents: number | null;
  feePercent: number | null;
  sellerFloorCents: number | null;
  sellerTargetCents: number | null;
  preferredCounterLowCents: number | null;
  preferredCounterHighCents: number | null;
}

export interface MarketplaceReplyRecommendation {
  action: MarketplaceReplyAction;
  headline: string;
  reason: string;
}

export interface MarketplaceReplyGenerationContext {
  thread: MessageThread;
  messages: Message[];
  negotiation: NegotiationAnalysis | null;
  latestBuyerMessage: Message | null;
  latestSellerMessage: Message | null;
  lastMessage: Message | null;
  stage: MarketplaceConversationStage;
  deal: MarketplaceDealContext;
  sellerMessageCount: number;
  buyerMessageCount: number;
  hasOfferSignals: boolean;
}

export interface MarketplaceReplyDraftResult {
  reply: string;
  source: MarketplaceReplySource;
  action: MarketplaceReplyAction;
  stage: MarketplaceConversationStage;
  recommendation: MarketplaceReplyRecommendation;
}

const OFFER_SIGNAL_PATTERN =
  /\b(offer|would you take|can you do|i can do|best price|best you can do|take\s+\$|for\s+\$|at\s+\$|shipped|ship(?:ped)?\s+for|closer to)\b/i;
const CLOSE_SIGNAL_PATTERN =
  /\b(pay(?:ment)?|buy now|i(?:'| a)m ready|ready to buy|deal|i(?:'| a)ll take it|send (?:the )?offer|lock it in)\b/i;
const CONDITION_SIGNAL_PATTERN =
  /\b(condition|corner|surface|edge|centering|crease|scratch|photo|photos|scan|refractor|auto|numbered)\b/i;
const SHIPPING_SIGNAL_PATTERN =
  /\b(ship|shipping|tracking|combine|delivery|mailer|bubble mailer|signature)\b/i;
const DETAILS_SIGNAL_PATTERN =
  /\b(details|more info|clarify|question|confirm)\b/i;

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return null;
  return (Date.now() - value) / 3_600_000;
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function normalizeSellerNote(note?: string | null): string | null {
  const trimmed = note?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, " ");
}

function appendSellerNote(base: string, sellerNote?: string | null): string {
  const note = normalizeSellerNote(sellerNote);
  if (!note) return base;
  const needsPeriod = !/[.!?]$/.test(base);
  return `${needsPeriod ? `${base}.` : base} ${note}`;
}

export function formatCurrencyFromCents(cents: number | null | undefined): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return formatPrice(cents / 100);
}

export function parseMarketplaceOfferAmount(text: string | null | undefined): number | null {
  const body = text?.trim();
  if (!body || !OFFER_SIGNAL_PATTERN.test(body)) return null;

  const matches = Array.from(body.matchAll(/(?:\$|usd\s*)?(\d{1,5}(?:\.\d{1,2})?)/gi));
  const candidates = matches
    .map((match) => {
      const raw = match[1]?.replace(/,/g, "");
      const value = raw ? Number.parseFloat(raw) : Number.NaN;
      if (!Number.isFinite(value)) return null;
      if (value < 5 || value > 100_000) return null;
      return Math.round(value * 100);
    })
    .filter((value): value is number => typeof value === "number");

  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

export type AutoResolveReason = "buyer_thanks" | "seller_quiet";

export interface AutoResolveClassification {
  resolvable: boolean;
  reason: AutoResolveReason | null;
  label: string | null;
}

const THANKS_PATTERN =
  /\b(thanks|thank you|thank u|appreciate it|appreciated|thx|ty|got it|received|ok thanks|sounds good|all good|perfect|awesome)\b[\s!.,]*$/i;

export function classifyAutoResolvable(
  thread: MessageThread,
  lastMessage: { body: string; direction: Message["direction"]; created_at: string } | null,
  now: number = Date.now()
): AutoResolveClassification {
  if (thread.status === "resolved" || thread.status === "archived") {
    return { resolvable: false, reason: null, label: null };
  }
  if (!lastMessage) return { resolvable: false, reason: null, label: null };

  // Heuristic A — buyer "thanks" / closure message after seller has replied
  if (
    lastMessage.direction === "inbound" &&
    lastMessage.body.trim().length < 80 &&
    THANKS_PATTERN.test(lastMessage.body.trim())
  ) {
    return {
      resolvable: true,
      reason: "buyer_thanks",
      label: "Agent resolved · buyer acknowledged",
    };
  }

  // Heuristic B — seller sent last and it's been >7 days quiet
  if (lastMessage.direction === "outbound") {
    const ageDays = (now - new Date(lastMessage.created_at).getTime()) / 86_400_000;
    if (ageDays >= 7) {
      return {
        resolvable: true,
        reason: "seller_quiet",
        label: "Agent archived · stale 7d+",
      };
    }
  }

  return { resolvable: false, reason: null, label: null };
}

export function classifyThreadFromPreview(
  thread: MessageThread,
  now: number = Date.now()
): AutoResolveClassification {
  // Lightweight version that works from MessageThread alone (no message bodies loaded yet).
  // Uses last_message_preview + last_message_at + buyer/unread signals.
  if (thread.status === "resolved" || thread.status === "archived") {
    return { resolvable: false, reason: null, label: null };
  }
  const preview = (thread.last_message_preview ?? "").trim();
  // Buyer-thanks heuristic: thread is awaiting_buyer (we sent last) AND a fresh inbound preview matches thanks.
  // We approximate "buyer sent last" via unread_count > 0 or status=needs_response.
  const looksLikeBuyerLast =
    thread.unread_count > 0 || thread.status === "needs_response";
  if (
    looksLikeBuyerLast &&
    preview.length > 0 &&
    preview.length < 80 &&
    THANKS_PATTERN.test(preview)
  ) {
    return {
      resolvable: true,
      reason: "buyer_thanks",
      label: "Agent resolved · buyer acknowledged",
    };
  }
  if (thread.status === "awaiting_buyer") {
    const ageDays =
      (now - new Date(thread.last_message_at).getTime()) / 86_400_000;
    if (ageDays >= 7) {
      return {
        resolvable: true,
        reason: "seller_quiet",
        label: "Agent archived · stale 7d+",
      };
    }
  }
  return { resolvable: false, reason: null, label: null };
}

export function getMarketplaceReplyActionMeta(action: MarketplaceReplyAction) {
  return (
    MARKETPLACE_REPLY_ACTIONS.find((option) => option.id === action) ??
    MARKETPLACE_REPLY_ACTIONS[0]
  );
}

export function createMarketplaceReplyContext(args: {
  thread: MessageThread;
  messages: Message[];
  negotiation?: NegotiationAnalysis | null;
}): MarketplaceReplyGenerationContext {
  const { thread, messages, negotiation = null } = args;
  const latestBuyerMessage =
    [...messages].reverse().find((message) => message.direction === "inbound") ?? null;
  const latestSellerMessage =
    [...messages].reverse().find((message) => message.direction === "outbound") ?? null;
  const lastMessage = messages.at(-1) ?? null;
  const latestBuyerText = latestBuyerMessage?.body ?? thread.last_message_preview ?? "";
  const latestOfferCents =
    thread.offer_amount_cents ?? parseMarketplaceOfferAmount(latestBuyerText);
  const hasOfferSignals =
    thread.category === "offer" ||
    latestOfferCents !== null ||
    OFFER_SIGNAL_PATTERN.test(latestBuyerText);
  const lastTouchHours = hoursSince(lastMessage?.created_at ?? thread.last_message_at);
  const sellerWaitingHours = hoursSince(latestSellerMessage?.created_at);

  let stage: MarketplaceConversationStage = "new_inquiry";
  if (thread.status === "resolved" || thread.status === "archived") {
    stage = "resolved";
  } else if (
    thread.category === "complaint" ||
    thread.category === "return_refund"
  ) {
    stage = "post_sale";
  } else if (
    CLOSE_SIGNAL_PATTERN.test(latestBuyerText) &&
    (hasOfferSignals || thread.status === "awaiting_buyer")
  ) {
    stage = "near_close";
  } else if (
    (thread.status === "awaiting_buyer" && sellerWaitingHours !== null && sellerWaitingHours >= 36) ||
    (lastTouchHours !== null && lastTouchHours >= 72)
  ) {
    stage = "stale";
  } else if (hasOfferSignals) {
    stage = "negotiating";
  } else if (messages.length > 0 && latestSellerMessage) {
    stage = "new_inquiry";
  }

  return {
    thread: {
      ...thread,
      category: hasOfferSignals ? "offer" : thread.category,
      offer_amount_cents: latestOfferCents,
    },
    messages,
    negotiation,
    latestBuyerMessage,
    latestSellerMessage,
    lastMessage,
    stage,
    deal: {
      askingPriceCents: thread.listing_price_cents,
      latestOfferCents,
      suggestedCounterCents:
        negotiation?.suggested_counter_cents ?? thread.suggested_counter_cents,
      estimatedNetCents:
        negotiation?.estimated_net_cents ?? thread.estimated_net_cents,
      estimatedProfitCents:
        negotiation?.estimated_profit_cents ?? thread.estimated_profit_cents,
      feePercent: negotiation?.fee_percent ?? thread.fee_percent,
      sellerFloorCents: null,
      sellerTargetCents: null,
      preferredCounterLowCents: null,
      preferredCounterHighCents: null,
    },
    sellerMessageCount: messages.filter((message) => message.direction === "outbound").length,
    buyerMessageCount: messages.filter((message) => message.direction === "inbound").length,
    hasOfferSignals,
  };
}

export function recommendMarketplaceReplyAction(
  context: MarketplaceReplyGenerationContext
): MarketplaceReplyRecommendation {
  const counterText = formatCurrencyFromCents(context.deal.suggestedCounterCents);
  const suggestedAction = context.thread.suggested_action;

  if (context.negotiation?.recommended_action === "accept" || context.stage === "near_close") {
    return {
      action: "accept_close",
      headline: "Best move: close now",
      reason:
        "The buyer looks close enough to convert. Keep the message direct and move them to payment.",
    };
  }

  if (context.negotiation?.recommended_action === "counter" && counterText) {
    return {
      action: "counteroffer",
      headline: `Best move: counter at ${counterText}`,
      reason:
        "There is still room to protect margin without losing the buyer. Counter with one clean number.",
    };
  }

  if (context.negotiation?.recommended_action === "hold_firm") {
    return {
      action: "hold_firm",
      headline: "Best move: hold firm",
      reason: "The price is already where you want it. Keep it short and confident.",
    };
  }

  if (context.negotiation?.recommended_action === "decline") {
    return {
      action: "decline",
      headline: "Best move: decline",
      reason:
        "The offer is too soft to make sense. Pass cleanly and leave a path back if they come up.",
    };
  }

  if (suggestedAction === "counter" && counterText) {
    return {
      action: "counteroffer",
      headline: `Best move: counter at ${counterText}`,
      reason:
        "The buyer is still below your number, but there is room to move them closer with one clean counter.",
    };
  }

  if (suggestedAction === "hold_firm") {
    return {
      action: "hold_firm",
      headline: "Best move: hold firm",
      reason: "The buyer is close enough that you can stay at your number and let them decide.",
    };
  }

  if (suggestedAction === "decline") {
    return {
      action: "decline",
      headline: "Best move: decline",
      reason:
        "The current number is too far off. A clean pass is stronger than dragging the thread out.",
    };
  }

  if (context.stage === "stale") {
    return {
      action: "reengage",
      headline: "Best move: re-engage buyer",
      reason: "The thread has gone quiet. A short follow-up can still recover the sale.",
    };
  }

  if (
    context.latestBuyerMessage &&
    CONDITION_SIGNAL_PATTERN.test(context.latestBuyerMessage.body)
  ) {
    return {
      action: "clarify",
      headline: "Best move: clarify condition",
      reason: "They are asking for specifics. Answer cleanly and reduce hesitation.",
    };
  }

  if (
    context.latestBuyerMessage &&
    SHIPPING_SIGNAL_PATTERN.test(context.latestBuyerMessage.body)
  ) {
    return {
      action: "clarify",
      headline: "Best move: clarify shipping",
      reason: "Shipping detail is the blocker. Remove friction and keep the deal moving.",
    };
  }

  if (
    context.latestBuyerMessage &&
    CLOSE_SIGNAL_PATTERN.test(context.latestBuyerMessage.body)
  ) {
    return {
      action: "ask_payment",
      headline: "Best move: ask for payment now",
      reason: "The buyer sounds ready. Give them a direct next step instead of overexplaining.",
    };
  }

  return {
    action: "smart_reply",
    headline: "Best move: send a clean reply",
    reason: "Answer the buyer directly and keep the thread moving without extra fluff.",
  };
}

function buildPriceAnchor(
  amountCents: number | null | undefined,
  fallback: string
): string {
  const formatted = formatCurrencyFromCents(amountCents);
  return formatted ? formatted : fallback;
}

export function buildFallbackMarketplaceReply(args: {
  context: MarketplaceReplyGenerationContext;
  action: MarketplaceReplyAction;
  sellerNote?: string;
}): string {
  const { context, action, sellerNote } = args;
  const latestBuyerText = context.latestBuyerMessage?.body ?? "";
  const askText = buildPriceAnchor(
    context.deal.askingPriceCents,
    "the current price"
  );
  const offerText = formatCurrencyFromCents(context.deal.latestOfferCents);
  const counterText = buildPriceAnchor(
    context.deal.suggestedCounterCents ??
      context.deal.sellerTargetCents ??
      context.deal.preferredCounterHighCents ??
      context.deal.askingPriceCents,
    "a little higher"
  );

  let draft: string;
  switch (action) {
    case "counteroffer":
      draft = offerText
        ? `Appreciate it. I'd be at ${counterText} on this one right now. Let me know if that works.`
        : `I'd be closer to ${counterText} on this one right now. Let me know if you want to make that work.`;
      break;
    case "hold_firm":
      draft = `Appreciate the offer. I'm staying at ${askText} on this one. If that works for you, it's yours.`;
      break;
    case "decline":
      draft = `Appreciate the offer, but I can't get there on this one. If you come up, let me know.`;
      break;
    case "accept_close":
      draft = offerText
        ? `That works for me at ${offerText}. If you send it through, I'll get it packed up and ready to move.`
        : `That works for me. If you send the payment through, I'll get it packed up and moving.`;
      break;
    case "ask_payment":
      draft = offerText
        ? `If ${offerText} works for you, go ahead and send it through and I'll lock it in.`
        : `If you're ready, send the payment through and I'll lock it in for you.`;
      break;
    case "ask_time":
      draft = `Give me a little time on this and I'll circle back shortly with a clear update.`;
      break;
    case "reengage":
      draft = context.deal.suggestedCounterCents
        ? `Checking back on this. If you're still interested, I can do ${counterText} and get it wrapped up today.`
        : `Checking back on this in case you're still interested. It's available if you want to wrap it up.`;
      break;
    case "clarify":
      if (CONDITION_SIGNAL_PATTERN.test(latestBuyerText)) {
        draft = `Happy to clarify the condition. If you want a specific corner, edge, or surface angle, I can send that over.`;
      } else if (SHIPPING_SIGNAL_PATTERN.test(latestBuyerText)) {
        draft = `Happy to clarify the shipping side. Let me know exactly what you want confirmed and I'll send it over.`;
      } else {
        draft = `Happy to clarify. Let me know what detail you want confirmed and I'll send it over.`;
      }
      break;
    case "smart_reply":
    default:
      if (context.hasOfferSignals) {
        draft = `Appreciate it. I'd be closer to ${counterText} right now. Let me know if that works.`;
      } else if (CONDITION_SIGNAL_PATTERN.test(latestBuyerText)) {
        draft = `Happy to clarify the condition. Let me know what angle or detail you want me to confirm.`;
      } else if (SHIPPING_SIGNAL_PATTERN.test(latestBuyerText)) {
        draft = `Happy to help on the shipping side. Let me know what detail you want confirmed and I'll send it over.`;
      } else if (DETAILS_SIGNAL_PATTERN.test(latestBuyerText)) {
        draft = `Happy to clarify. Let me know exactly what detail you want me to confirm and I'll send it over.`;
      } else {
        draft = `Appreciate the message. Let me know what you need and I'll keep it moving on my end.`;
      }
      break;
  }

  return appendSellerNote(draft, sellerNote);
}

export function describeConversationStage(stage: MarketplaceConversationStage): string {
  switch (stage) {
    case "new_inquiry":
      return "New inquiry";
    case "negotiating":
      return "Negotiating";
    case "near_close":
      return "Close to deal";
    case "stale":
      return "Stale thread";
    case "post_sale":
      return "Post-sale";
    case "resolved":
      return "Resolved";
    default:
      return toTitleCase(stage);
  }
}
