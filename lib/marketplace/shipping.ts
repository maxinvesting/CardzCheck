/**
 * Shipping label generation for marketplace orders.
 *
 * Provider-agnostic surface with two backends:
 *   - Shippo (https://goshippo.com) when SHIPPO_API_KEY is set — creates a
 *     shipment, picks the cheapest rate, and buys a real label.
 *   - A deterministic mock otherwise — returns a fake tracking number + a
 *     placeholder label so the full buy → ship → track flow works in dev and
 *     in environments without carrier credentials. Mirrors lib/test-mode.ts.
 *
 * Server-only.
 */

export interface ShippingAddress {
  name: string;
  phone?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string; // ISO-2, e.g. "US"
  email?: string | null;
}

export interface Parcel {
  length: number; // inches
  width: number;
  height: number;
  weightOz: number;
}

export interface PurchaseLabelInput {
  from: ShippingAddress;
  to: ShippingAddress;
  parcel?: Partial<Parcel>;
  /** Free-text reference printed on the label / stored with the transaction. */
  reference?: string;
}

export interface ShippingLabel {
  provider: "shippo" | "mock";
  shipmentId: string;
  rateId: string;
  carrier: string;
  serviceLevel: string;
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  costCents: number;
}

/** Bubble mailer + one graded slab — a sane default for trading cards. */
const DEFAULT_PARCEL: Parcel = {
  length: 9,
  width: 6,
  height: 1,
  weightOz: 4,
};

const SHIPPO_BASE = "https://api.goshippo.com";

export function isShippoConfigured(): boolean {
  return Boolean(process.env.SHIPPO_API_KEY?.trim());
}

function assertAddress(addr: ShippingAddress, role: "from" | "to") {
  const missing = (["name", "street1", "city", "state", "zip", "country"] as const).filter(
    (k) => !String(addr[k] ?? "").trim()
  );
  if (missing.length) {
    throw new Error(`Incomplete ${role} address: missing ${missing.join(", ")}`);
  }
}

/**
 * Buy a shipping label. Throws on hard failure (caller maps to a 4xx/5xx).
 */
export async function purchaseShippingLabel(
  input: PurchaseLabelInput
): Promise<ShippingLabel> {
  assertAddress(input.from, "from");
  assertAddress(input.to, "to");

  const parcel: Parcel = { ...DEFAULT_PARCEL, ...(input.parcel ?? {}) };

  if (isShippoConfigured()) {
    return purchaseViaShippo(input, parcel);
  }
  return purchaseViaMock(input, parcel);
}

// ---------------------------------------------------------------------------
// Shippo backend
// ---------------------------------------------------------------------------

interface ShippoAddress {
  name: string;
  phone?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email?: string;
}

function toShippoAddress(a: ShippingAddress): ShippoAddress {
  return {
    name: a.name,
    phone: a.phone ?? undefined,
    street1: a.street1,
    street2: a.street2 ?? undefined,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    email: a.email ?? undefined,
  };
}

async function shippoFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY!.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { detail?: string };
  if (!res.ok) {
    throw new Error(
      `Shippo ${path} failed (${res.status}): ${json?.detail ?? "unknown error"}`
    );
  }
  return json;
}

interface ShippoRate {
  object_id: string;
  amount: string; // dollars, e.g. "5.50"
  currency: string;
  provider: string; // carrier, e.g. "USPS"
  servicelevel: { name: string; token: string };
}

interface ShippoShipment {
  object_id: string;
  status: string;
  rates: ShippoRate[];
}

interface ShippoTransaction {
  object_id: string;
  status: string;
  label_url: string;
  tracking_number: string;
  tracking_url_provider: string;
  rate: string;
  messages?: { text: string }[];
}

async function purchaseViaShippo(
  input: PurchaseLabelInput,
  parcel: Parcel
): Promise<ShippingLabel> {
  const shipment = await shippoFetch<ShippoShipment>("/shipments/", {
    address_from: toShippoAddress(input.from),
    address_to: toShippoAddress(input.to),
    parcels: [
      {
        length: String(parcel.length),
        width: String(parcel.width),
        height: String(parcel.height),
        distance_unit: "in",
        weight: String(parcel.weightOz),
        mass_unit: "oz",
      },
    ],
    async: false,
  });

  const rates = (shipment.rates ?? []).filter((r) => Number.isFinite(Number(r.amount)));
  if (!rates.length) {
    throw new Error("No shipping rates available for this address pair");
  }
  // Cheapest rate wins.
  const rate = rates.reduce((best, r) =>
    Number(r.amount) < Number(best.amount) ? r : best
  );

  const tx = await shippoFetch<ShippoTransaction>("/transactions/", {
    rate: rate.object_id,
    label_file_type: "PDF",
    async: false,
  });

  if (tx.status !== "SUCCESS") {
    const msg = tx.messages?.map((m) => m.text).join("; ") || tx.status;
    throw new Error(`Shippo label purchase failed: ${msg}`);
  }

  return {
    provider: "shippo",
    shipmentId: shipment.object_id,
    rateId: rate.object_id,
    carrier: rate.provider,
    serviceLevel: rate.servicelevel?.name ?? rate.servicelevel?.token ?? "",
    trackingNumber: tx.tracking_number,
    trackingUrl: tx.tracking_url_provider,
    labelUrl: tx.label_url,
    costCents: Math.round(Number(rate.amount) * 100),
  };
}

// ---------------------------------------------------------------------------
// Mock backend (no carrier credentials configured)
// ---------------------------------------------------------------------------

function mockTracking(seed: string): string {
  // USPS-style 22-digit number, deterministic from the seed so repeated calls
  // for the same order are stable. FNV-1a hash seeds a small LCG that emits
  // digits (avoids BigInt for older TS targets).
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let digits = "";
  for (let i = 0; i < 18; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    digits += String(h % 10);
  }
  return `9400${digits}`; // 4 + 18 = 22 digits
}

function purchaseViaMock(
  input: PurchaseLabelInput,
  _parcel: Parcel
): ShippingLabel {
  const seed = `${input.reference ?? ""}:${input.to.zip}:${input.from.zip}:${input.to.name}`;
  const tracking = mockTracking(seed);
  return {
    provider: "mock",
    shipmentId: `mock_ship_${tracking.slice(-10)}`,
    rateId: `mock_rate_${tracking.slice(-8)}`,
    carrier: "USPS",
    serviceLevel: "Ground Advantage",
    trackingNumber: tracking,
    trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`,
    // Placeholder label image — clearly a test label, valid URL the UI can open.
    labelUrl: `https://placehold.co/600x900/0B0D0F/E6E8EB.png?text=CardzCheck+TEST+Label%0A${tracking}`,
    costCents: 599,
  };
}
