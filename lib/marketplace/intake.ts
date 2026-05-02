import { z } from "zod";

export const ALLOWED_GRADING_SERVICES = ["PSA", "BGS", "SGC"] as const;
export const ALLOWED_MANUFACTURERS = ["topps", "panini"] as const;

export const MIN_ESTIMATED_VALUE_CENTS = 10_000;
export const ELITE_THRESHOLD_CENTS = 500_000;
export const STANDARD_MIN_SOLD_COMPS = 1;

export type GradingService = (typeof ALLOWED_GRADING_SERVICES)[number];
export type Manufacturer = (typeof ALLOWED_MANUFACTURERS)[number];
export type Pipeline = "standard" | "elite" | "grails";

export const intakeCardSchema = z.object({
  title: z.string().min(1).max(300),
  player: z.string().min(1).max(120),
  year: z.number().int().min(1900).max(2100),
  manufacturer: z.string().transform((v) => v.toLowerCase().trim()),
  grade: z.string().min(1).max(20),
  grading_service: z.string().transform((v) => v.toUpperCase().trim()),
  cert_number: z.string().min(1).max(40).nullable().optional(),
  parallel: z.string().max(120).nullable().optional(),
  print_run: z.number().int().positive().nullable().optional(),
  estimated_value_cents: z.number().int().nonnegative(),
});

export type IntakeCardInput = z.infer<typeof intakeCardSchema>;

export type IntakeRejectionReason =
  | "below_minimum_value"
  | "unsupported_grading_service"
  | "unsupported_manufacturer"
  | "no_sold_comps";

export type IntakeResult =
  | {
      approved: true;
      pipeline: Pipeline;
      requires_manual_approval: boolean;
    }
  | {
      approved: false;
      rejection_reason: IntakeRejectionReason;
    };

/**
 * Pure validator. Does not touch the DB. Caller supplies sold-comp count
 * (typically resolved via lib/market-discount/service.ts before calling).
 */
export function validateIntake(
  card: IntakeCardInput,
  soldCompsCount: number
): IntakeResult {
  if (card.estimated_value_cents < MIN_ESTIMATED_VALUE_CENTS) {
    return { approved: false, rejection_reason: "below_minimum_value" };
  }

  if (
    !ALLOWED_GRADING_SERVICES.includes(card.grading_service as GradingService)
  ) {
    return { approved: false, rejection_reason: "unsupported_grading_service" };
  }

  if (!ALLOWED_MANUFACTURERS.includes(card.manufacturer as Manufacturer)) {
    return { approved: false, rejection_reason: "unsupported_manufacturer" };
  }

  if (card.estimated_value_cents >= ELITE_THRESHOLD_CENTS) {
    return {
      approved: true,
      pipeline: "elite",
      requires_manual_approval: true,
    };
  }

  if (soldCompsCount < STANDARD_MIN_SOLD_COMPS) {
    return { approved: false, rejection_reason: "no_sold_comps" };
  }

  return {
    approved: true,
    pipeline: "standard",
    requires_manual_approval: false,
  };
}
