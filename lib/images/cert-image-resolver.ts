import "server-only";

import type { Page } from "playwright";
import { buildCertPageUrl, isUsableResolvedCertImageUrl, type CertGrader } from "@/lib/images/cert-image";
import { uniqueTrustedImageUrls } from "@/lib/images/shared";

export interface CertImageResolutionResult {
  status: "resolved" | "no_image";
  imageUrl: string | null;
  sourcePageUrl: string;
  lastError?: string | null;
}

type PlaywrightModule = typeof import("playwright");
type TcgapisResolutionResult = CertImageResolutionResult | null;

function getTcgapisApiKey(): string | null {
  const key = process.env.TCGAPIS_API_KEY?.trim();
  return key || null;
}

export function isTcgapisProviderConfigured(): boolean {
  return Boolean(getTcgapisApiKey());
}

function getTcgapisBaseUrl(): string {
  return process.env.TCGAPIS_BASE_URL?.replace(/\/+$/, "") ?? "https://api.tcgapis.com/api/v1";
}

function collectTcgapisImageUrlCandidates(payload: unknown): string[] {
  const candidates: string[] = [];

  const walk = (value: unknown, keyPath: string[] = []) => {
    if (typeof value === "string") {
      const path = keyPath.join(".").toLowerCase();
      if (/image|images|front|back|url|src/.test(path)) {
        candidates.push(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, [...keyPath, String(index)]));
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const [key, entry] of Object.entries(value)) {
      walk(entry, [...keyPath, key]);
    }
  };

  walk(payload);
  return candidates;
}

function hasAnyProviderImageField(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;

  const stack: unknown[] = [payload];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;

    for (const [key, value] of Object.entries(current)) {
      if (/image|images|front|back/.test(key.toLowerCase())) return true;
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return false;
}

export async function resolvePsaCertImageFromTcgapis(params: {
  certNumber: string;
  fetchImpl?: typeof fetch;
}): Promise<TcgapisResolutionResult> {
  const apiKey = getTcgapisApiKey();
  if (!apiKey) return null;

  const fetcher = params.fetchImpl ?? fetch;
  const endpoint = `${getTcgapisBaseUrl()}/psa/${encodeURIComponent(params.certNumber)}`;
  const sourcePageUrl = buildCertPageUrl({ grader: "PSA", certNumber: params.certNumber });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404 || response.status === 204) {
    return {
      status: "no_image",
      imageUrl: null,
      sourcePageUrl,
      lastError: "TCGAPIS returned no image",
    };
  }

  if (!response.ok) {
    throw new Error(`TCGAPIs PSA lookup failed with ${response.status}`);
  }

  const payload = await response.json().catch(() => {
    throw new Error("TCGAPIs PSA lookup returned invalid JSON");
  });

  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: unknown }).success === false
  ) {
    const message =
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : "TCGAPIs PSA lookup was unsuccessful";

    if (/not found|no data|missing/i.test(message)) {
      return { status: "no_image", imageUrl: null, sourcePageUrl, lastError: message };
    }

    throw new Error(message);
  }

  const candidates = collectTcgapisImageUrlCandidates(payload);
  const imageUrl = pickBestResolvedCertImageUrl(candidates, params.certNumber);

  if (imageUrl) {
    return { status: "resolved", imageUrl, sourcePageUrl };
  }

  if (hasAnyProviderImageField(payload)) {
    throw new Error("TCGAPIs returned image fields, but none were usable HTTPS image URLs");
  }

  return {
    status: "no_image",
    imageUrl: null,
    sourcePageUrl,
    lastError: "TCGAPIS returned no image",
  };
}

function scoreCandidateUrl(url: string, certNumber: string): number {
  let score = 0;
  const lower = url.toLowerCase();
  if (lower.includes(certNumber.toLowerCase())) score += 40;
  if (/\.(jpe?g|png|webp|avif)(\?|$)/.test(lower)) score += 15;
  if (/front|obverse|slab|scan/.test(lower)) score += 20;
  if (/back|reverse/.test(lower)) score -= 10;
  if (/thumb|thumbnail|icon|logo|avatar/.test(lower)) score -= 50;
  if (lower.includes("cloudfront")) score += 10;
  return score;
}

export function pickBestResolvedCertImageUrl(
  values: Array<string>,
  certNumber: string
): string | null {
  const ranked = uniqueTrustedImageUrls(values)
    .filter((url) => isUsableResolvedCertImageUrl(url))
    .map((url) => ({ url, score: scoreCandidateUrl(url, certNumber) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score > 0 ? ranked[0].url : null;
}

async function collectPageImageCandidates(page: Page): Promise<string[]> {
  const domCandidates = await page.evaluate(() => {
    const urls = new Set<string>();
    const addUrl = (value: string | null | undefined) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      urls.add(trimmed);
    };

    const addSrcSet = (value: string | null | undefined) => {
      if (typeof value !== "string") return;
      for (const entry of value.split(",")) {
        const url = entry.trim().split(/\s+/)[0];
        addUrl(url);
      }
    };

    document.querySelectorAll("img").forEach((img) => {
      addUrl(img.getAttribute("src"));
      addUrl((img as HTMLImageElement).currentSrc);
      addSrcSet(img.getAttribute("srcset"));
    });

    document.querySelectorAll("source").forEach((source) => {
      addSrcSet(source.getAttribute("srcset"));
      addUrl(source.getAttribute("src"));
    });

    document.querySelectorAll("a").forEach((anchor) => {
      addUrl(anchor.getAttribute("href"));
    });

    document.querySelectorAll("meta[property='og:image'], meta[name='twitter:image']").forEach((meta) => {
      addUrl(meta.getAttribute("content"));
    });

    document.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
      const style = node.getAttribute("style") ?? "";
      for (const match of style.matchAll(/url\((['"]?)(.*?)\1\)/g)) {
        addUrl(match[2]);
      }
    });

    document.querySelectorAll("script[type='application/ld+json']").forEach((script) => {
      const text = script.textContent ?? "";
      for (const match of text.matchAll(/https?:\/\/[^\s"'\\]+/g)) {
        addUrl(match[0]);
      }
    });

    return Array.from(urls);
  });

  return domCandidates;
}

async function trySubmitLookup(page: Page, certNumber: string): Promise<void> {
  const inputSelectors = [
    "input[name*='cert' i]",
    "input[id*='cert' i]",
    "input[placeholder*='cert' i]",
    "input[type='search']",
    "input[type='text']",
  ];

  for (const selector of inputSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;

    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;

    await locator.fill(certNumber);

    const buttonSelectors = [
      "button:has-text('Verify')",
      "button:has-text('Lookup')",
      "button:has-text('Search')",
      "button:has-text('Go')",
      "button:has-text('Submit')",
      "input[type='submit']",
    ];

    for (const buttonSelector of buttonSelectors) {
      const button = page.locator(buttonSelector).first();
      if ((await button.count()) === 0) continue;
      const buttonVisible = await button.isVisible().catch(() => false);
      if (!buttonVisible) continue;

      await Promise.allSettled([
        page.waitForLoadState("networkidle", { timeout: 10000 }),
        button.click(),
      ]);
      return;
    }

    await locator.press("Enter").catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
    return;
  }
}

async function collectResolvedImageCandidates(
  page: Page,
  networkUrls: string[]
): Promise<string[]> {
  await page.waitForTimeout(1500);
  const domCandidates = await collectPageImageCandidates(page);

  return uniqueTrustedImageUrls([...networkUrls, ...domCandidates]).filter((candidate) =>
    isUsableResolvedCertImageUrl(candidate)
  );
}

async function withPlaywright<T>(fn: (playwright: PlaywrightModule) => Promise<T>): Promise<T> {
  const playwright = await import("playwright");
  return fn(playwright);
}

export async function resolveCertImage(params: {
  grader: CertGrader;
  certNumber: string;
}): Promise<CertImageResolutionResult> {
  const sourcePageUrl = buildCertPageUrl(params);

  if (params.grader === "PSA") {
    const providerResult = await resolvePsaCertImageFromTcgapis({
      certNumber: params.certNumber,
    });
    if (providerResult) return providerResult;
  }

  return withPlaywright(async ({ chromium }) => {
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
      const networkUrls: string[] = [];
      page.on("response", (response) => {
        try {
          const request = response.request();
          if (request.resourceType() !== "image") return;
          const url = response.url();
          if (isUsableResolvedCertImageUrl(url)) {
            networkUrls.push(url);
          }
        } catch {
          // Ignore transient browser response errors.
        }
      });

      await page.goto(sourcePageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

      // Some graders land on a lookup form instead of a direct result page.
      if (!page.url().includes(params.certNumber)) {
        await trySubmitLookup(page, params.certNumber);
      }

      const title = await page.title().catch(() => "");
      if (/just a moment|attention required|access denied/i.test(title)) {
        throw new Error(`Browser challenge on ${params.grader} cert page`);
      }

      const candidateUrls = await collectResolvedImageCandidates(page, networkUrls);
      const imageUrl = pickBestResolvedCertImageUrl(candidateUrls, params.certNumber);

      return {
        status: imageUrl ? "resolved" : "no_image",
        imageUrl,
        sourcePageUrl: page.url() || sourcePageUrl,
      };
    } finally {
      await browser.close();
    }
  });
}
