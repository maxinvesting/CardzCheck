import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkProAccess } from "@/lib/access";

export type NewsItem = {
  id: string;
  title: string;
  snippet: string;
  url: string | null;
  source: string;
  sourceLabel: string;
  category: "industry" | "grading" | "market" | "platform" | "business";
  publishedAt: string; // ISO
  isAnnouncement: boolean;
  isPinned?: boolean;
};

// ── Minimal RSS parser ────────────────────────────────────────────────────
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    "i"
  );
  const m = re.exec(xml);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

function parseRSS(xml: string, source: string, sourceLabel: string, category: NewsItem["category"]): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = itemRe.exec(xml)) !== null && items.length < 8) {
    const chunk = m[1];
    const title = extractTag(chunk, "title");
    const link = extractTag(chunk, "link") || extractTag(chunk, "guid");
    const description = extractTag(chunk, "description");
    const pubDate = extractTag(chunk, "pubDate") || extractTag(chunk, "dc:date") || "";

    if (!title) continue;

    const snippet = description.slice(0, 180).replace(/\s+/g, " ").trim() +
      (description.length > 180 ? "…" : "");

    let publishedAt = new Date().toISOString();
    try {
      const parsed = new Date(pubDate);
      if (!isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
    } catch {}

    items.push({
      id: `${source}-${idx++}`,
      title,
      snippet,
      url: link || null,
      source,
      sourceLabel,
      category,
      publishedAt,
      isAnnouncement: false,
    });
  }
  return items;
}

// ── RSS sources ───────────────────────────────────────────────────────────
const RSS_SOURCES = [
  {
    url: "https://www.sportscollectorsdaily.com/feed/",
    source: "scd",
    sourceLabel: "Sports Collectors Daily",
    category: "industry" as NewsItem["category"],
  },
  {
    url: "https://www.cardboardconnection.com/feed",
    source: "cbc",
    sourceLabel: "Cardboard Connection",
    category: "industry" as NewsItem["category"],
  },
  {
    url: "https://www.beckett.com/news/feed/",
    source: "beckett",
    sourceLabel: "Beckett Media",
    category: "grading" as NewsItem["category"],
  },
];

// ── In-memory RSS cache (15-minute TTL) ──────────────────────────────────
type CacheEntry = { items: NewsItem[]; expires: number };
const rssCache = new Map<string, CacheEntry>();
const CACHE_TTL = 15 * 60 * 1000; // 15 min

async function fetchFeed(src: (typeof RSS_SOURCES)[number]): Promise<NewsItem[]> {
  const cached = rssCache.get(src.source);
  if (cached && cached.expires > Date.now()) return cached.items;

  try {
    const res = await fetch(src.url, {
      headers: { "User-Agent": "CardzCheck/1.0 (+https://cardzcheck.com)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSS(xml, src.source, src.sourceLabel, src.category);
    rssCache.set(src.source, { items, expires: Date.now() + CACHE_TTL });
    return items;
  } catch {
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isBusiness = user
    ? (await checkProAccess(user.id)).isBusiness
    : false;

  // Fetch RSS feeds concurrently
  const feedResults = await Promise.allSettled(RSS_SOURCES.map(fetchFeed));
  const feedItems: NewsItem[] = feedResults
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 30);

  // Fetch announcements from DB
  let announcements: NewsItem[] = [];
  try {
    const service = (await import("@/lib/supabase/server")).createServiceClient();
    const query = service
      .from("announcements")
      .select("*")
      .lte("published_at", new Date().toISOString())
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(10);

    if (!isBusiness) {
      query.eq("is_public", true);
    }

    const { data } = await query;
    if (data) {
      announcements = data.map((a) => ({
        id: `ann-${a.id}`,
        title: a.title,
        snippet: a.body,
        url: null,
        source: "cardzcheck",
        sourceLabel: "CardzCheck",
        category: (a.category as NewsItem["category"]) ?? "platform",
        publishedAt: a.published_at,
        isAnnouncement: true,
        isPinned: a.is_pinned,
      }));
    }
  } catch {}

  return NextResponse.json({
    announcements,
    feed: feedItems,
    isBusiness,
    fetchedAt: new Date().toISOString(),
  });
}
