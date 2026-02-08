/**
 * Export Grade Probability panel as PNG.
 *
 * Optional attribution can be appended to the exported image only; it never
 * appears in the live UI. This keeps the in-app experience clean while allowing
 * shared images (e.g. eBay listings, social) to carry proper attribution and
 * disclaimers when desired.
 */

import html2canvas from "html2canvas";

const ATTRIBUTION_TEXT =
  "AI condition estimate by CardzCheck · Not affiliated with PSA or BGS";

/** ~60–70% opacity: subtle but visible on export */
const ATTRIBUTION_OPACITY = 0.65;

const EXPORT_ROOT_ATTR = "data-export-root";
const EXPORT_DISCLAIMER_ATTR = "data-export-disclaimer";
const EXPORT_ATTRIBUTION_ATTR = "data-export-attribution";

/**
 * Captures `element` (Grade Probability panel root), composites a small
 * attribution line at the bottom-right of the image, and returns a PNG blob.
 * The attribution does not appear in the live DOM.
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
  }
): Promise<Blob> {
  const exportId = `grade-probability-export-${Date.now()}-${Math.round(
    Math.random() * 10000
  )}`;
  const previousExportId = element.getAttribute(EXPORT_ROOT_ATTR);
  element.setAttribute(EXPORT_ROOT_ATTR, exportId);

  const includeAttribution = options?.includeAttribution ?? true;
  const debug = options?.debug ?? false;
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

        const ignoreNodes = root.querySelectorAll(
          '[data-export-ignore="true"]'
        );
        ignoreNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            node.style.display = "none";
          }
        });

        const disclaimer = root.querySelector(
          `[${EXPORT_DISCLAIMER_ATTR}="true"]`
        ) as HTMLElement | null;
        const view = clonedDoc.defaultView;
        const computed = disclaimer && view ? view.getComputedStyle(disclaimer) : null;

        if (includeAttribution) {
          const footerWrap = clonedDoc.createElement("div");
          footerWrap.setAttribute(EXPORT_ATTRIBUTION_ATTR, "true");
          footerWrap.style.display = "flex";
          footerWrap.style.justifyContent = "flex-end";
          footerWrap.style.paddingTop = "8px";
          footerWrap.style.marginTop = "6px";

          const footerText = clonedDoc.createElement("span");
          footerText.textContent = ATTRIBUTION_TEXT;
          footerText.style.fontFamily =
            computed?.fontFamily ?? "system-ui, -apple-system, sans-serif";
          footerText.style.fontSize = computed?.fontSize ?? "12px";
          footerText.style.fontWeight = computed?.fontWeight ?? "400";
          footerText.style.letterSpacing = computed?.letterSpacing ?? "0.02em";
          footerText.style.lineHeight = "1.2";
          footerText.style.color = "rgb(209, 213, 219)";
          footerText.style.opacity = String(ATTRIBUTION_OPACITY);
          footerText.style.textAlign = "right";
          footerText.style.maxWidth = "90%";
          footerText.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.35)";

          footerWrap.appendChild(footerText);
          root.appendChild(footerWrap);

          footerInjected = true;
        }
      },
    });

    options?.onCanvas?.(canvas);
    if (debug && typeof window !== "undefined") {
      const rect = element.getBoundingClientRect();
      console.info("[grade-export]", {
        elementWidth: rect.width,
        elementHeight: rect.height,
        scale: options?.scale ?? 2,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        devicePixelRatio: window.devicePixelRatio || 1,
        includeAttribution,
      });
    }

    if (!footerInjected) {
      const error = new Error(
        "Attribution footer missing in export DOM."
      );
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
 * Triggers a download of the Grade Probability panel as a PNG with
 * optional attribution footer (export-only; not shown in-app).
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
        onCanvas: (canvas) => {
          lastCanvas = canvas;
          options?.onCanvas?.(canvas);
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
