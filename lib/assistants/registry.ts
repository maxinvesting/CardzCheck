// Central registry of CardzCheck AI Assistants.
//
// "Assistants" is a first-class product category — a suite of specialized AI
// tools for sports-card dealers. New assistants (Pricing Agent, Grading Agent,
// Inventory Agent, Market Research Agent, …) are added here and automatically
// surface in the sidebar nav and on the Assistants landing page. Keep this the
// single source of truth so navigation and routing scale cleanly.

export type AssistantStatus = "live" | "coming-soon";

export type AssistantDef = {
  /** Stable slug — also the route segment under /assistants. */
  id: string;
  /** Short nav + card label. */
  name: string;
  /** One-line capability summary shown on cards and tooltips. */
  description: string;
  /** Route the assistant renders at. */
  href: string;
  /** Lifecycle state — gates whether the card is clickable. */
  status: AssistantStatus;
  /** Capability tags shown as pills on the landing card. */
  tags: string[];
  /** Icon key resolved by the shared <AssistantIcon /> component. */
  icon: AssistantIconKey;
};

export type AssistantIconKey =
  | "advisor"
  | "sales"
  | "pricing"
  | "grading"
  | "inventory"
  | "research";

export const ASSISTANTS: AssistantDef[] = [
  {
    id: "advisor",
    name: "Business Advisor",
    description:
      "Analyze inventory, pricing, grading opportunities, liquidity, and business performance.",
    href: "/assistants/advisor",
    status: "live",
    tags: ["Pricing", "Inventory", "Grading", "Liquidity"],
    icon: "advisor",
  },
];

/** Assistants surfaced as "coming soon" on the landing page only (not in nav). */
export const PLANNED_ASSISTANTS: AssistantDef[] = [
  {
    id: "pricing",
    name: "Pricing Agent",
    description:
      "Continuously reprice inventory against live comps and demand signals.",
    href: "/assistants/pricing",
    status: "coming-soon",
    tags: ["Repricing", "Comps", "Demand"],
    icon: "pricing",
  },
  {
    id: "grading",
    name: "Grading Agent",
    description:
      "Predict grades, surface submission candidates, and model grading ROI.",
    href: "/assistants/grading",
    status: "coming-soon",
    tags: ["Grade Predict", "Submissions", "ROI"],
    icon: "grading",
  },
  {
    id: "inventory",
    name: "Inventory Agent",
    description:
      "Track aging, flag dead capital, and recommend buy / hold / liquidate moves.",
    href: "/assistants/inventory",
    status: "coming-soon",
    tags: ["Aging", "Dead Capital", "Turnover"],
    icon: "inventory",
  },
  {
    id: "research",
    name: "Market Research Agent",
    description:
      "Monitor player, set, and category trends to spot opportunities early.",
    href: "/assistants/research",
    status: "coming-soon",
    tags: ["Trends", "Players", "Categories"],
    icon: "research",
  },
];

/** Assistants that appear in the sidebar nav (live only). */
export const NAV_ASSISTANTS = ASSISTANTS.filter((a) => a.status === "live");
