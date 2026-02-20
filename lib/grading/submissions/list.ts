import { toSubmissionRecord } from "@/lib/grading/submissions/db";
import type { GradingSubmissionRecord } from "@/lib/grading/submissions/types";

export type SubmissionListRow = GradingSubmissionRecord & {
  item_count: number;
  card_count: number;
};

function toSafeQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.round(parsed));
    }
  }
  return 1;
}

export function buildSubmissionListRows(
  submissionRows: Array<Record<string, unknown>> | null | undefined,
  itemRows: Array<Record<string, unknown>> | null | undefined
): SubmissionListRow[] {
  const submissions = (submissionRows ?? []).map((row) => toSubmissionRecord(row));

  if (submissions.length === 0) {
    return [];
  }

  const itemCounts = new Map<string, { items: number; cards: number }>();
  (itemRows ?? []).forEach((row) => {
    const submissionId = String((row as { submission_id?: unknown }).submission_id ?? "");
    if (!submissionId) return;
    const quantity = toSafeQuantity((row as { quantity?: unknown }).quantity);
    const current = itemCounts.get(submissionId) ?? { items: 0, cards: 0 };
    current.items += 1;
    current.cards += quantity;
    itemCounts.set(submissionId, current);
  });

  return submissions.map((submission) => {
    const count = itemCounts.get(submission.id) ?? { items: 0, cards: 0 };
    return {
      ...submission,
      item_count: count.items,
      card_count: count.cards,
    };
  });
}
