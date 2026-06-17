import type { AssistantIconKey } from "@/lib/assistants/registry";

// Shared assistant visual language. Every assistant icon is a single-weight,
// rounded line glyph on the same 24×24 grid so the suite reads as one family —
// institutional, not consumer-chatbot. The orbiting "node" motif (a core mark
// with a small satellite spark) signals "AI agent" consistently across tools.

type Props = {
  icon: AssistantIconKey;
  className?: string;
};

const PATHS: Record<AssistantIconKey, React.ReactNode> = {
  // Advisor — analytic core with insight spark.
  advisor: (
    <>
      <path d="M4 19V5m0 14h16M8 16l3.5-4 3 2.5L20 8" />
      <circle cx="20" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  // Sales — deal terminal / exchange.
  sales: (
    <>
      <path d="M4 7h16M4 12h10M4 17h7" />
      <path d="M15 15l2.5 2.5L22 13" />
    </>
  ),
  // Pricing — tag with live signal.
  pricing: (
    <>
      <path d="M3 12V5a2 2 0 012-2h7l9 9-9 9-9-9z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  // Grading — shield check.
  grading: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  // Inventory — stacked layers.
  inventory: (
    <>
      <path d="M12 3l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4M4 16.5l8 4 8-4" />
    </>
  ),
  // Research — radar / scope.
  research: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 11l4-2M16.5 16.5L21 21" />
    </>
  ),
};

export default function AssistantIcon({ icon, className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[icon]}
    </svg>
  );
}
