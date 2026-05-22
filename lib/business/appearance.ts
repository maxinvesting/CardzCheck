import type { CSSProperties } from "react";
import type { BusinessAppearance } from "@/types";

export const BUSINESS_APPEARANCE_UPDATED_EVENT =
  "cardzcheck:business-appearance-updated";

export const DEFAULT_BUSINESS_APPEARANCE: BusinessAppearance = {
  primaryColor: "#E4E4E4",
  secondaryColor: "#A8A8A8",
  tertiaryColor: "#787878",
};

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;

type AppearanceRow = {
  appearance_primary_color?: string | null;
  appearance_secondary_color?: string | null;
  appearance_tertiary_color?: string | null;
};

type BusinessAppearanceInput = Partial<BusinessAppearance> & {
  reset?: boolean;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type BusinessAppearanceCssVariables = CSSProperties & {
  "--biz-primary"?: string;
  "--biz-primary-hover"?: string;
  "--biz-primary-soft"?: string;
  "--biz-primary-soft-strong"?: string;
  "--biz-primary-border"?: string;
  "--biz-primary-foreground"?: string;
  "--biz-secondary"?: string;
  "--biz-secondary-hover"?: string;
  "--biz-secondary-soft"?: string;
  "--biz-secondary-soft-strong"?: string;
  "--biz-secondary-border"?: string;
  "--biz-secondary-foreground"?: string;
  "--biz-tertiary"?: string;
  "--biz-tertiary-hover"?: string;
  "--biz-tertiary-soft"?: string;
  "--biz-tertiary-soft-strong"?: string;
  "--biz-tertiary-border"?: string;
  "--biz-tertiary-foreground"?: string;
  "--biz-link"?: string;
  "--biz-focus"?: string;
  "--biz-nav-active-bg"?: string;
  "--biz-nav-active-border"?: string;
  "--biz-profit"?: string;
  "--biz-profit-soft"?: string;
  "--biz-success-soft"?: string;
};

export function normalizeHexColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(HEX_COLOR_RE);
  if (!match) return null;
  return `#${match[1].toUpperCase()}`;
}

export function isBusinessAppearance(
  value: unknown
): value is BusinessAppearanceInput {
  return typeof value === "object" && value !== null;
}

export function normalizeBusinessAppearance(
  value: Partial<BusinessAppearance> | null | undefined
): BusinessAppearance {
  return {
    primaryColor:
      normalizeHexColor(value?.primaryColor) ??
      DEFAULT_BUSINESS_APPEARANCE.primaryColor,
    secondaryColor:
      normalizeHexColor(value?.secondaryColor) ??
      DEFAULT_BUSINESS_APPEARANCE.secondaryColor,
    tertiaryColor:
      normalizeHexColor(value?.tertiaryColor) ??
      DEFAULT_BUSINESS_APPEARANCE.tertiaryColor,
  };
}

export function parseBusinessAppearanceInput(
  value: unknown
): { appearance: BusinessAppearance | null; error: string | null; reset: boolean } {
  if (!isBusinessAppearance(value)) {
    return {
      appearance: null,
      error: "Appearance payload must be an object",
      reset: false,
    };
  }

  if (value.reset === true) {
    return {
      appearance: { ...DEFAULT_BUSINESS_APPEARANCE },
      error: null,
      reset: true,
    };
  }

  const primaryColor = normalizeHexColor(
    typeof value.primaryColor === "string" ? value.primaryColor : null
  );
  const secondaryColor = normalizeHexColor(
    typeof value.secondaryColor === "string" ? value.secondaryColor : null
  );
  const tertiaryColor = normalizeHexColor(
    typeof value.tertiaryColor === "string" ? value.tertiaryColor : null
  );

  if (!primaryColor || !secondaryColor || !tertiaryColor) {
    return {
      appearance: null,
      error: "primaryColor, secondaryColor, and tertiaryColor must be valid #RRGGBB values",
      reset: false,
    };
  }

  return {
    appearance: {
      primaryColor,
      secondaryColor,
      tertiaryColor,
    },
    error: null,
    reset: false,
  };
}

export function businessAppearanceFromRow(row: AppearanceRow | null | undefined): BusinessAppearance {
  return normalizeBusinessAppearance({
    primaryColor: row?.appearance_primary_color ?? undefined,
    secondaryColor: row?.appearance_secondary_color ?? undefined,
    tertiaryColor: row?.appearance_tertiary_color ?? undefined,
  });
}

export function businessAppearanceToRow(appearance: BusinessAppearance) {
  return {
    appearance_primary_color: appearance.primaryColor,
    appearance_secondary_color: appearance.secondaryColor,
    appearance_tertiary_color: appearance.tertiaryColor,
  };
}

/**
 * Workspace shell always uses the neutral default palette for CSS variables so
 * the operator UI stays monochrome (saved appearance colors are not applied to chrome).
 */
export function getBusinessAppearanceCssVariables(
  _appearance: BusinessAppearance
): BusinessAppearanceCssVariables {
  const normalized = normalizeBusinessAppearance(DEFAULT_BUSINESS_APPEARANCE);

  return {
    "--biz-primary": normalized.primaryColor,
    "--biz-primary-hover": mixWithBlack(normalized.primaryColor, 0.12),
    "--biz-primary-soft": toAlpha(normalized.primaryColor, 0.1),
    "--biz-primary-soft-strong": toAlpha(normalized.primaryColor, 0.16),
    "--biz-primary-border": toAlpha(normalized.primaryColor, 0.28),
    "--biz-primary-foreground": getReadableTextColor(normalized.primaryColor),
    "--biz-secondary": normalized.secondaryColor,
    "--biz-secondary-hover": mixWithBlack(normalized.secondaryColor, 0.12),
    "--biz-secondary-soft": toAlpha(normalized.secondaryColor, 0.09),
    "--biz-secondary-soft-strong": toAlpha(normalized.secondaryColor, 0.15),
    "--biz-secondary-border": toAlpha(normalized.secondaryColor, 0.25),
    "--biz-secondary-foreground": getReadableTextColor(normalized.secondaryColor),
    "--biz-tertiary": normalized.tertiaryColor,
    "--biz-tertiary-hover": mixWithBlack(normalized.tertiaryColor, 0.12),
    "--biz-tertiary-soft": toAlpha(normalized.tertiaryColor, 0.09),
    "--biz-tertiary-soft-strong": toAlpha(normalized.tertiaryColor, 0.15),
    "--biz-tertiary-border": toAlpha(normalized.tertiaryColor, 0.25),
    "--biz-tertiary-foreground": getReadableTextColor(normalized.tertiaryColor),
    /* Monochrome operator shell — links / profit / focus stay restrained */
    "--biz-link": "#C8C8C8",
    "--biz-focus": "rgba(255, 255, 255, 0.18)",
    "--biz-nav-active-bg": "rgba(255, 255, 255, 0.05)",
    "--biz-nav-active-border": "rgba(243, 243, 243, 0.32)",
    "--biz-profit": "#9BACA3",
    "--biz-profit-soft": "rgba(155, 172, 163, 0.14)",
    "--biz-success-soft": "rgba(155, 172, 163, 0.1)",
  };
}

function hexToRgb(value: string): Rgb {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return hexToRgb(DEFAULT_BUSINESS_APPEARANCE.primaryColor);
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function mixWithBlack(value: string, amount: number): string {
  const rgb = hexToRgb(value);
  return rgbToHex({
    r: Math.round(rgb.r * (1 - amount)),
    g: Math.round(rgb.g * (1 - amount)),
    b: Math.round(rgb.b * (1 - amount)),
  });
}

function rgbToHex(rgb: Rgb): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => clamp(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function toAlpha(value: string, alpha: number): string {
  const rgb = hexToRgb(value);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(
    0,
    Math.min(1, alpha)
  ).toFixed(3)})`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function getReadableTextColor(value: string): string {
  const { r, g, b } = hexToRgb(value);
  const luminance = relativeLuminance(r, g, b);
  return luminance > 0.55 ? "#0F172A" : "#FFFFFF";
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
