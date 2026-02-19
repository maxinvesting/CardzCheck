import { z } from "next/dist/compiled/zod";
import {
  SUBMISSION_GRADERS,
  SUBMISSION_MODES,
  SUBMISSION_SOURCE_TYPES,
  SUBMISSION_STATUSES,
} from "@/lib/grading/submissions/types";

const nonNegativeInt = z.number().int().min(0);

export const submissionModeSchema = z.enum(SUBMISSION_MODES);
export const submissionGraderSchema = z.enum(SUBMISSION_GRADERS);
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export const submissionSourceTypeSchema = z.enum(SUBMISSION_SOURCE_TYPES);

export const predictedDistributionSchema = z.object({
  "10": z.number().min(0).max(1).optional(),
  "9": z.number().min(0).max(1).optional(),
  "8": z.number().min(0).max(1).optional(),
  "7_or_lower": z.number().min(0).max(1).optional(),
});

export const submissionCardIdentitySchema = z.object({
  player_name: z.string().trim().min(1).max(120),
  year: z.string().trim().max(20).optional().nullable(),
  set_name: z.string().trim().max(120).optional().nullable(),
  card_number: z.string().trim().max(40).optional().nullable(),
  parallel_type: z.string().trim().max(120).optional().nullable(),
  variation: z.string().trim().max(120).optional().nullable(),
  insert: z.string().trim().max(120).optional().nullable(),
});

export const createSubmissionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mode: submissionModeSchema,
  grader: submissionGraderSchema.optional().default("psa"),
});

export const updateSubmissionSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: submissionStatusSchema.optional(),
    psa_order_id: z.string().trim().max(80).optional().nullable(),
    service_level: z.string().trim().max(120).optional().nullable(),
    declared_value_cents: nonNegativeInt.optional(),
    shipping_cents: nonNegativeInt.optional(),
    insurance_cents: nonNegativeInt.optional(),
    fees_estimate_cents: nonNegativeInt.optional(),
    fees_actual_cents: nonNegativeInt.optional().nullable(),
  })
  .refine((payload: Record<string, unknown>) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const createSubmissionItemSchema = z.object({
  source_type: submissionSourceTypeSchema,
  source_id: z.string().trim().max(100).optional().nullable(),
  title: z.string().trim().min(1).max(240),
  quantity: z.number().int().min(1).max(500).optional().default(1),
  cost_basis_cents: nonNegativeInt.optional().nullable(),
  predicted_distribution: predictedDistributionSchema.optional(),
  target_grade: z.string().trim().max(40).optional().nullable(),
  card: submissionCardIdentitySchema.optional(),
});

export const createSubmissionItemsSchema = z.object({
  items: z.array(createSubmissionItemSchema).min(1).max(100),
});

export const bulkUpdateReturnedGradesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        actual_grade: z.string().trim().min(1).max(40),
        cert_number: z.string().trim().max(80).optional().nullable(),
      })
    )
    .min(1)
    .max(500),
});
