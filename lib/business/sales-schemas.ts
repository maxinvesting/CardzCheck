import { z } from "next/dist/compiled/zod";

export const SALES_CHANNELS = [
  "ebay",
  "whatnot",
  "instagram",
  "show",
  "local",
  "other",
] as const;

// Max $9,999,999.99 — guards against overflow in metrics/aggregation math
// and prevents obviously bogus entries ($9B card sale) from corrupting reporting.
const MAX_CENTS = 999_999_999;
const centsSchema = z.number().int().min(0).max(MAX_CENTS);
const optionalCentsSchema = z.number().int().min(0).max(MAX_CENTS).optional().nullable();

// ISO 8601 date (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm...) only.
// Plain .string() would accept arbitrary garbage fed into date range DB queries.
const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/, "Must be an ISO 8601 date")
  .optional();

export const listSalesQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(200).optional().default(50),
  channel: z.enum(SALES_CHANNELS).optional(),
  search: z.string().trim().max(120).optional(),
  inventory_item_id: z.string().uuid().optional(),
});

export const createSaleSchema = z.object({
  inventory_item_id: z.string().uuid().optional().nullable(),
  channel: z.enum(SALES_CHANNELS).optional(),
  sold_at: z.string().trim().min(1).optional(),
  sold_price_cents: centsSchema,
  shipping_charged_cents: optionalCentsSchema,
  platform_fees_cents: optionalCentsSchema,
  shipping_cost_cents: optionalCentsSchema,
  tax_cents: optionalCentsSchema,
  net_payout_cents: optionalCentsSchema,
  cogs_cents: optionalCentsSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
  external_order_id: z.string().trim().max(120).optional().nullable(),
});

export const updateSaleSchema = createSaleSchema
  .partial()
  .refine((payload: Record<string, unknown>) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });
