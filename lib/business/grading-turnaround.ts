/**
 * Business-day countdown for cards out at grading.
 *
 * A card sent on day D with an N-business-day turnaround has N days left on D,
 * and loses one for every weekday (Mon–Fri) that passes after D. Weekends don't
 * count. Holidays aren't modeled.
 */

function parseIsoDate(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Weekdays strictly after `from` up to and including `to` (0 if to <= from). */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Adds `days` business days to `from` (the estimated return date). */
export function addBusinessDays(from: Date, days: number): Date {
  const cursor = startOfDay(from);
  let remaining = days;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return cursor;
}

export interface GradingCountdown {
  /** Business days left; negative when the turnaround estimate has passed. */
  daysRemaining: number;
  estimatedReturnDate: Date;
  overdue: boolean;
}

export function getGradingCountdown(
  sentDate: string | null | undefined,
  turnaroundDays: number | null | undefined,
  today: Date = new Date()
): GradingCountdown | null {
  if (!sentDate || turnaroundDays == null || !Number.isFinite(turnaroundDays)) return null;
  const sent = parseIsoDate(sentDate);
  if (!sent) return null;
  const daysRemaining = turnaroundDays - businessDaysBetween(sent, today);
  return {
    daysRemaining,
    estimatedReturnDate: addBusinessDays(sent, turnaroundDays),
    overdue: daysRemaining < 0,
  };
}

/** Short label, e.g. "87 bus. days left", "Due today", "3 days overdue". */
export function formatGradingCountdown(countdown: GradingCountdown): string {
  const { daysRemaining } = countdown;
  if (daysRemaining > 0) return `${daysRemaining} bus. day${daysRemaining === 1 ? "" : "s"} left`;
  if (daysRemaining === 0) return "Due today";
  const over = -daysRemaining;
  return `${over} bus. day${over === 1 ? "" : "s"} overdue`;
}
