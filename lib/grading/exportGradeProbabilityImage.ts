/**
 * Export Grade Probability panel as PNG, or open the print page for PDF.
 *
 * Two export paths:
 *   • PNG  — captures the GradeReportPrint layout (white background, scale 3).
 *   • PDF  — stores report data in sessionStorage and opens /grade-report/print
 *            in a new window; the browser's native print dialog produces a
 *            vector-text PDF with zero extra dependencies.
 *
 * The legacy exportGradeProbabilityImage / downloadGradeProbabilityImage
 * functions are kept for backward compatibility.
 */

import html2canvas from "html2canvas";
import { preTokens } from "@/theme/tokens";
import type { GradeReportPrintProps } from "@/components/grading/GradeReportPrint";

export const GRADE_REPORT_SESSION_KEY = "cc_grade_report_data";
const PRINT_PAGE_PATH = "/grade-report/print";

const ATTRIBUTION_TEXT =
  "AI condition estimate by CardzCheck · Not affiliated with PSA, BGS, CGC, SGC, or TAG";

const ATTRIBUTION_OPACITY = 0.55;

const EXPORT_ROOT_ATTR = "data-export-root";
const EXPORT_DISCLAIMER_ATTR = "data-export-disclaimer";
const EXPORT_ATTRIBUTION_ATTR = "data-export-attribution";
const EXPORT_REPORT_HEADER_ATTR = "data-export-report-header";

export interface GradeReportMeta {
  cardLabel?: string;
  generatedAt?: string;
  confidenceLabel?: string;
}

const RAW = preTokens.raw;

/**
 * Captures `element` (Grade Probability panel root), injects a branded
 * report header above the content (export-only), optionally appends an
 * attribution line, and returns a PNG blob.
 */
export async function exportGradeProbabilityImage(
  element: HTMLElement,
  options?: {
    scale?: number;
    includeAttribution?: boolean;
    debug?: boolean;
    onCanvas?: (canvas: HTMLCanvasElement) => void;
    minWidth?: number;
    minHeight?: number;
    maxScale?: number;
    reportMeta?: GradeReportMeta;
  }
): Promise<Blob> {
  const exportId = `grade-probability-export-${Date.now()}-${Math.round(
    Math.random() * 10000
  )}`;
  const previousExportId = element.getAttribute(EXPORT_ROOT_ATTR);
  element.setAttribute(EXPORT_ROOT_ATTR, exportId);

  const includeAttribution = options?.includeAttribution ?? true;
  const reportMeta = options?.reportMeta;
  let footerInjected = !includeAttribution;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: options?.scale ?? 2,
      useCORS: true,
      logging: false,
      ignoreElements: (el) => el.getAttribute("data-export-ignore") === "true",
      onclone: (clonedDoc) => {
        const root = clonedDoc.querySelector(
          `[${EXPORT_ROOT_ATTR}="${exportId}"]`
        ) as HTMLElement | null;
        if (!root) return;

        // Hide elements marked as export-only-invisible
        const ignoreNodes = root.querySelectorAll('[data-export-ignore="true"]');
        ignoreNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            node.style.display = "none";
          }
        });

        // ── Inject branded report header ───────────────────────────
        if (reportMeta !== undefined) {
          const header = clonedDoc.createElement("div");
          header.setAttribute(EXPORT_REPORT_HEADER_ATTR, "true");

          const fontStack = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

          Object.assign(header.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 13px",
            borderBottom: `1px solid ${RAW.borderDefault}`,
            backgroundColor: RAW.bgSurface,
            fontFamily: fontStack,
          });

          // Left: brand + title
          const leftGroup = clonedDoc.createElement("div");
          Object.assign(leftGroup.style, { display: "flex", flexDirection: "column", gap: "2px" });

          const brand = clonedDoc.createElement("span");
          brand.textContent = "CardzCheck";
          Object.assign(brand.style, {
            fontFamily: fontStack,
            fontSize: "10px",
            fontWeight: "600",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: RAW.textMuted,
          });

          const title = clonedDoc.createElement("span");
          title.textContent = "Grade Report";
          Object.assign(title.style, {
            fontFamily: fontStack,
            fontSize: "15px",
            fontWeight: "700",
            color: RAW.textPrimary,
            letterSpacing: "-0.01em",
          });

          leftGroup.appendChild(brand);
          leftGroup.appendChild(title);

          // Right: card label + timestamp
          const rightGroup = clonedDoc.createElement("div");
          Object.assign(rightGroup.style, {
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "2px",
          });

          if (reportMeta.cardLabel) {
            const cardLabelEl = clonedDoc.createElement("span");
            cardLabelEl.textContent = reportMeta.cardLabel;
            Object.assign(cardLabelEl.style, {
              fontFamily: fontStack,
              fontSize: "12px",
              fontWeight: "500",
              color: RAW.textSecondary,
              maxWidth: "340px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            });
            rightGroup.appendChild(cardLabelEl);
          }

          const metaLine = clonedDoc.createElement("span");
          const datePart = reportMeta.generatedAt
            ? new Date(reportMeta.generatedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const confidencePart = reportMeta.confidenceLabel
            ? ` · ${reportMeta.confidenceLabel} confidence`
            : "";
          metaLine.textContent = `${datePart}${confidencePart}`;
          Object.assign(metaLine.style, {
            fontFamily: fontStack,
            fontSize: "10px",
            fontWeight: "400",
            color: RAW.textMuted,
            letterSpacing: "0.02em",
          });
          rightGroup.appendChild(metaLine);

          header.appendChild(leftGroup);
          header.appendChild(rightGroup);
          root.insertBefore(header, root.firstChild);
        }

        // ── Attribution footer (export-only) ───────────────────────
        const disclaimer = root.querySelector(
          `[${EXPORT_DISCLAIMER_ATTR}="true"]`
        ) as HTMLElement | null;
        const view = clonedDoc.defaultView;
        const computed = disclaimer && view ? view.getComputedStyle(disclaimer) : null;

        if (includeAttribution) {
          const footerWrap = clonedDoc.createElement("div");
          footerWrap.setAttribute(EXPORT_ATTRIBUTION_ATTR, "true");
          Object.assign(footerWrap.style, {
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: "8px",
            marginTop: "4px",
          });

          const footerText = clonedDoc.createElement("span");
          footerText.textContent = ATTRIBUTION_TEXT;
          Object.assign(footerText.style, {
            fontFamily: computed?.fontFamily ?? "system-ui, -apple-system, sans-serif",
            fontSize: "11px",
            fontWeight: "400",
            letterSpacing: "0.02em",
            lineHeight: "1.2",
            color: RAW.textSecondary,
            opacity: String(ATTRIBUTION_OPACITY),
            textAlign: "right",
            maxWidth: "90%",
          });

          footerWrap.appendChild(footerText);
          root.appendChild(footerWrap);
          footerInjected = true;
        }
      },
    });

    options?.onCanvas?.(canvas);

    if (options?.debug && typeof window !== "undefined") {
      const rect = element.getBoundingClientRect();
      console.info("[grade-export]", {
        elementWidth: rect.width,
        elementHeight: rect.height,
        scale: options?.scale ?? 2,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        devicePixelRatio: window.devicePixelRatio || 1,
        includeAttribution,
        reportMeta,
      });
    }

    if (!footerInjected) {
      const error = new Error("Attribution footer missing in export DOM.");
      if (process.env.NODE_ENV !== "production") {
        console.error("[exportGradeProbabilityImage]", error);
      }
      throw error;
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/png",
        0.92
      );
    });
  } finally {
    if (previousExportId === null) {
      element.removeAttribute(EXPORT_ROOT_ATTR);
    } else {
      element.setAttribute(EXPORT_ROOT_ATTR, previousExportId);
    }
  }
}

/**
 * Triggers a browser download of the Grade Probability panel as a PNG.
 * Includes an export-only branded report header and optional attribution.
 */
export async function downloadGradeProbabilityImage(
  element: HTMLElement,
  filenamePrefix = "cardzcheck-grade-estimate",
  options?: {
    scale?: number;
    includeAttribution?: boolean;
    debug?: boolean;
    onCanvas?: (canvas: HTMLCanvasElement) => void;
    minWidth?: number;
    minHeight?: number;
    maxScale?: number;
    reportMeta?: GradeReportMeta;
  }
): Promise<void> {
  let lastCanvas: HTMLCanvasElement | null = null;
  const blob = await exportGradeProbabilityImage(element, {
    ...options,
    onCanvas: (canvas) => {
      lastCanvas = canvas;
      options?.onCanvas?.(canvas);
    },
  });

  const minWidth = options?.minWidth ?? 0;
  const minHeight = options?.minHeight ?? 0;
  const canvas = lastCanvas as HTMLCanvasElement | null;
  const needsRetry =
    canvas !== null &&
    ((minWidth > 0 && canvas.width < minWidth) ||
      (minHeight > 0 && canvas.height < minHeight));

  if (needsRetry && canvas) {
    const widthFactor = minWidth > 0 ? minWidth / canvas.width : 1;
    const heightFactor = minHeight > 0 ? minHeight / canvas.height : 1;
    const extraScale = Math.max(1, widthFactor, heightFactor);
    const baseScale = options?.scale ?? 2;
    const maxScale = options?.maxScale ?? Math.max(baseScale, 6);
    const nextScale = Math.min(maxScale, Math.ceil(baseScale * extraScale));
    if (nextScale > baseScale) {
      const retryBlob = await exportGradeProbabilityImage(element, {
        ...options,
        scale: nextScale,
        onCanvas: (c) => {
          lastCanvas = c;
          options?.onCanvas?.(c);
        },
      });
      const url = URL.createObjectURL(retryBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${Date.now()}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── New high-resolution print-layout exports ──────────────────────────────

/**
 * Captures an already-rendered GradeReportPrint DOM element as a hi-res PNG.
 *
 * The element should be the root of the white print layout (794px wide).
 * Uses scale 3 and white background for a crisp, professional result.
 */
export async function downloadGradeReportPng(
  element: HTMLElement,
  filenamePrefix = "cardzcheck-grade-report"
): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 3,
    useCORS: true,
    logging: false,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("toBlob failed"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filenamePrefix}-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      "image/png",
      1.0
    );
  });
}

/**
 * Opens the /grade-report/print page in a new window for browser PDF export.
 *
 * Serializes all report data into sessionStorage before opening so the print
 * page can read it without URL query-string length limits.
 *
 * The print page auto-calls window.print() after a short hydration delay,
 * giving the user the browser's native "Save as PDF" dialog.
 */
export function openGradeReportPdf(
  data: GradeReportPrintProps & { slabId?: string }
): void {
  try {
    sessionStorage.setItem(GRADE_REPORT_SESSION_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage full or blocked — proceed anyway; print page will show an error
  }
  window.open(PRINT_PAGE_PATH, "_blank", "width=960,height=1200,menubar=0,toolbar=0");
}
