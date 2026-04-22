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

function normalizeLegacySalePayload(
  value: unknown
): Record<string, unknown> | unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const payload = { ...(value as Record<string, unknown>) };

  if (payload.sold_at == null && payload.sale_date != null) {
    payload.sold_at = payload.sale_date;
  }
  if (payload.sold_price_cents == null && payload.sale_price_cents != null) {
    payload.sold_price_cents = payload.sale_price_cents;
  }
  if (
    payload.shipping_cost_cents == null &&
    payload.shipping_paid_cents != null
  ) {
    payload.shipping_cost_cents = payload.shipping_paid_cents;
  }
  if (payload.tax_cents == null && payload.other_costs_cents != null) {
    payload.tax_cents = payload.other_costs_cents;
  }
  if (
    payload.net_payout_cents == null &&
    payload.net_proceeds_cents != null
  ) {
    payload.net_payout_cents = payload.net_proceeds_cents;
  }
  if (
    payload.external_order_id == null &&
    payload.order_id != null
  ) {
    payload.external_order_id = payload.order_id;
  }

  return payload;
}

const saleWriteFields = {
  inventory_item_id: z.string().uuid().optional().nullable(),
  channel: z.enum(SALES_CHANNELS).optional(),
  sold_at: z.string().trim().min(1).optional(),
  shipping_charged_cents: optionalCentsSchema,
  platform_fees_cents: optionalCentsSchema,
  shipping_cost_cents: optionalCentsSchema,
  tax_cents: optionalCentsSchema,
  net_payout_cents: optionalCentsSchema,
  cogs_cents: optionalCentsSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
  external_order_id: z.string().trim().max(120).optional().nullable(),
} satisfies z.ZodRawShape;

export const listSalesQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(200).optional().default(50),
  channel: z.enum(SALES_CHANNELS).optional(),
  search: z.string().trim().max(120).optional(),
  inventory_item_id: z.string().uuid().optional(),
});

export const createSaleSchema = z.preprocess(
  normalizeLegacySalePayload,
  z.object({
    ...saleWriteFields,
    sold_price_cents: centsSchema,
  })
);

export const updateSaleSchema = z.preprocess(
  normalizeLegacySalePayload,
  z
    .object({
      ...saleWriteFields,
      sold_price_cents: centsSchema.optional(),
    })
    .refine((payload: Record<string, unknown>) => Object.keys(payload).length > 0, {
      message: "At least one field is required",
    })
);
