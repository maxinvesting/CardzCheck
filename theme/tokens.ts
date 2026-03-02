/**
 * Design tokens for Grade Probability Engine UI and export template.
 *
 * Dark, premium, minimal — consistent across the web UI and the
 * html2canvas export.  Tailwind class helpers (tw.*) are for component
 * usage; raw values (raw.*) are for inline styles inside the export
 * onclone callback where Tailwind classes don't apply.
 */

export const preTokens = {
  // ── Tailwind class helpers ──────────────────────────────────────────
  tw: {
    bg: {
      page:    "bg-[#07111d]",
      surface: "bg-[#0c1a2e]",
      raised:  "bg-[#0f1f35]",
      inset:   "bg-[#091529]",
    },
    border: {
      subtle:  "border border-white/[0.06]",
      default: "border border-white/[0.10]",
      strong:  "border border-white/[0.16]",
      accent:  "border border-blue-500/30",
    },
    text: {
      primary:   "text-[#e2eaf3]",
      secondary: "text-[#7a91a8]",
      muted:     "text-[#3a5068]",
      accent:    "text-blue-400",
      success:   "text-emerald-400",
      warning:   "text-amber-400",
    },
    radius: {
      sm: "rounded",
      md: "rounded-lg",
      lg: "rounded-xl",
      xl: "rounded-2xl",
    },
    label: "text-[10px] uppercase tracking-widest font-medium",
  },

  // ── Raw CSS values (for inline styles in export template) ──────────
  raw: {
    bgPage:    "#07111d",
    bgSurface: "#0c1a2e",
    bgRaised:  "#0f1f35",
    bgInset:   "#091529",

    borderSubtle:  "rgba(255,255,255,0.06)",
    borderDefault: "rgba(255,255,255,0.10)",
    borderStrong:  "rgba(255,255,255,0.16)",

    textPrimary:   "#e2eaf3",
    textSecondary: "#7a91a8",
    textMuted:     "#3a5068",

    accentBlue:    "#3b82f6",
    accentEmerald: "#10b981",
    accentAmber:   "#f59e0b",

    barBlue:    "#2563eb",
    barEmerald: "#059669",
  },
} as const;

export type PreTokens = typeof preTokens;

/**
 * Confidence level → Tailwind pill classes (bg + text + border).
 * Single authoritative source so web UI and any future export share the
 * same style.
 */
export const confidencePillClasses: Record<string, string> = {
  high:   "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
  medium: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  low:    "bg-amber-500/10 text-amber-300 border border-amber-500/20",
};
