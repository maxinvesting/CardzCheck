import type { ParsedQuery, SmartSearchCandidate, SmartSearchMode, LockedConstraints } from "./types";

export interface FilterDiagnostics {
  droppedByConstraint: Record<string, number>;
  noExactMatchesBeforeBroadening: boolean;
}

export interface FilterResult {
  exact: SmartSearchCandidate[];
  close: SmartSearchCandidate[];
  diagnostics: FilterDiagnostics;
}

/**
 * Apply mode-aware hard constraints to candidates.
 * - Watchlist (strict): any mismatch on locked year/brand/line removes the candidate from Exact.
 * - Collection: mismatches are allowed, but only in the Close bucket.
 */
export function bucketByConstraints(
  parsed: ParsedQuery,
  candidates: SmartSearchCandidate[],
  mode: SmartSearchMode
): FilterResult {
  const locked = parsed.locked;
  const droppedByConstraint: Record<string, number> = {};

  const exact: SmartSearchCandidate[] = [];
  const close: SmartSearchCandidate[] = [];

  const hasLockedFields = !!(locked.year || locked.brand || locked.line || locked.cardNumber || locked.parallel);

  for (const cand of candidates) {
    const mismatches: LockedConstraints = {};

    if (locked.year && cand.year && normalize(locked.year) !== normalize(cand.year)) {
      mismatches.year = cand.year;
      droppedByConstraint.year = (droppedByConstraint.year ?? 0) + 1;
    }

    if (locked.brand && cand.brand && normalize(locked.brand) !== normalize(cand.brand)) {
      mismatches.brand = cand.brand;
      droppedByConstraint.brand = (droppedByConstraint.brand ?? 0) + 1;
    }

    if (locked.line && cand.line && normalize(locked.line) !== normalize(cand.line)) {
      mismatches.line = cand.line;
      droppedByConstraint.line = (droppedByConstraint.line ?? 0) + 1;
    }

    if (locked.cardNumber && cand.cardNumber && normalize(locked.cardNumber) !== normalize(cand.cardNumber)) {
      mismatches.cardNumber = cand.cardNumber;
      droppedByConstraint.cardNumber = (droppedByConstraint.cardNumber ?? 0) + 1;
    }

    if (locked.parallel && cand.parallel && normalize(locked.parallel) !== normalize(cand.parallel)) {
      mismatches.parallel = cand.parallel;
      droppedByConstraint.parallel = (droppedByConstraint.parallel ?? 0) + 1;
    }

    const hasMismatch = !!(mismatches.year || mismatches.brand || mismatches.line || mismatches.cardNumber || mismatches.parallel);

    if (mode === "watchlist") {
      // In strict mode, anything with a locked-field mismatch is excluded from Exact.
      if (hasMismatch && hasLockedFields) {
        // Candidate is only eligible for Close (if we decide to show broadened results).
        close.push({
          ...cand,
          hasLockedConstraintMismatch: true,
          mismatchedConstraints: mismatches,
        });
      } else {
        exact.push({
          ...cand,
          hasLockedConstraintMismatch: false,
          mismatchedConstraints: {},
        });
      }
    } else {
      // Collection mode: mismatches go to Close, matches stay in Exact.
      if (hasMismatch && hasLockedFields) {
        close.push({
          ...cand,
          hasLockedConstraintMismatch: true,
          mismatchedConstraints: mismatches,
        });
      } else {
        exact.push({
          ...cand,
          hasLockedConstraintMismatch: false,
          mismatchedConstraints: {},
        });
      }
    }
  }

  const noExactMatchesBeforeBroadening = hasLockedFields && exact.length === 0;

  return {
    exact,
    close,
    diagnostics: {
      droppedByConstraint,
      noExactMatchesBeforeBroadening,
    },
  };
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

