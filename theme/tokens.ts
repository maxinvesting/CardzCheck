/**
 * CardzCheck theme — operator shell palette + grade-probability export tokens.
 * Runtime shell colors: `styles/businessTheme.css` (`:root` / `.business-theme`).
 */

/** Matte shell — documentation + TS reference */
export const CC_THEME = {
  bg: {
    primary: "#0A0A0A",
    surface: "#111111",
    elevated: "#151515",
    rowHover: "#1A1A1A",
  },
  text: {
    primary: "#F3F3F3",
    secondary: "#A1A1A1",
    muted: "#6F6F6F",
  },
  border: "#222222",
  accentPositive: "#9BACA3",
  accentPositiveSoft: "rgba(155, 172, 163, 0.14)",
  chrome: {
    primary: "#E4E4E4",
    secondary: "#A8A8A8",
    tertiary: "#787878",
  },
} as const;

/**
 * Grade Probability Engine UI + html2canvas export template.
 * `tw.*` = Tailwind helpers; `raw.*` = inline styles in export onclone.
 */
export const preTokens = {
  tw: {
    bg: {
      page: "bg-[#0a0a0a]",
      surface: "bg-[#111111]",
      raised: "bg-[#151515]",
      inset: "bg-[#0d0d0d]",
    },
    border: {
      subtle: "border border-white/[0.06]",
      default: "border border-white/[0.08]",
      strong: "border border-white/[0.12]",
      accent: "border border-white/[0.14]",
    },
    text: {
      primary: "text-[#f3f3f3]",
      secondary: "text-[#a1a1a1]",
      muted: "text-[#6f6f6f]",
      accent: "text-[#c8c8c8]",
      success: "text-[#9baca3]",
      warning: "text-amber-500/90",
    },
    radius: {
      sm: "rounded",
      md: "rounded-lg",
      lg: "rounded-xl",
      xl: "rounded-2xl",
    },
    label: "text-[10px] uppercase tracking-widest font-medium",
  },

  raw: {
    bgPage: "#0a0a0a",
    bgSurface: "#111111",
    bgRaised: "#151515",
    bgInset: "#0d0d0d",

    borderSubtle: "rgba(255,255,255,0.06)",
    borderDefault: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.12)",

    textPrimary: "#f3f3f3",
    textSecondary: "#a1a1a1",
    textMuted: "#6f6f6f",

    accentBlue: "#8e96a3",
    accentEmerald: "#9baca3",
    accentAmber: "#c9a227",

    barBlue: "#6b7280",
    barEmerald: "#7a8a82",
  },
} as const;

export type PreTokens = typeof preTokens;

/** Confidence level → pill classes (shared UI + export) */
export const confidencePillClasses: Record<string, string> = {
  high: "bg-white/[0.06] text-[#d4d4d4] border border-white/[0.12]",
  medium: "bg-white/[0.05] text-[#a1a1a1] border border-white/[0.1]",
  low: "bg-amber-500/10 text-amber-200/90 border border-amber-500/20",
};
