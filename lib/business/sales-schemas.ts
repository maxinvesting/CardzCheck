import { z } from "zod";

export const SALES_CHANNELS = [
  "ebay",
  "whatnot",
  "instagram",
  "show",
  "local",
  "other",
] as const;

const centsSchema = z.number().int();
const optionalCentsSchema = z.number().int().optional().nullable();

export const listSalesQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
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
