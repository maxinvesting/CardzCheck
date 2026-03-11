"use client";

import { useEffect, useState, useCallback } from "react";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";

type NewsItem = {
  id: string;
  title: string;
  snippet: string;
  url: string | null;
  source: string;
  sourceLabel: string;
  category: "industry" | "grading" | "market" | "platform" | "business";
  publishedAt: string;
  isAnnouncement: boolean;
  isPinned?: boolean;
};

type NewsResponse = {
  announcements: NewsItem[];
  feed: NewsItem[];
  isBusiness: boolean;
  fetchedAt: string;
};

type Category = "all" | "industry" | "grading" | "market" | "platform" | "business";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "All",
  industry: "Industry",
  grading: "Grading",
  market: "Market",
  platform: "CardzCheck",
  business: "Business",
};

const CATEGORY_COLORS: Record<string, string> = {
  industry: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  grading: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  market: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  platform: "text-blue-300 bg-blue-500/10 border-blue-500/20",
  business: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 6) return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 1) return `${m}m ago`;
  return "just now";
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[category] ?? "text-[var(--biz-muted)] border-white/10"}`}>
      {CATEGORY_LABELS[category as Category] ?? category}
    </span>
  );
}

// ── Announcement row (pinned look) ────────────────────────────────────────
function AnnouncementRow({ item, isFirst }: { item: NewsItem; isFirst: boolean }) {
  return (
    <div className={`flex gap-4 py-5 ${isFirst ? "" : "border-t border-[color:var(--biz-border)]"}`}>
      <div className="mt-0.5 h-full w-0.5 shrink-0 self-stretch rounded-full bg-amber-500/50" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <CategoryPill category={item.category} />
          {item.isPinned && (
            <span className="text-[10px] font-medium text-[var(--biz-muted)] uppercase tracking-wider">
              Pinned
            </span>
          )}
          <span className="text-[11px] text-[var(--biz-muted)]">{timeAgo(item.publishedAt)}</span>
        </div>
        <h3 className="text-sm font-semibold leading-snug text-[var(--biz-text)]">{item.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--biz-muted)]">{item.snippet}</p>
      </div>
    </div>
  );
}

// ── Lead article (first feed item, bigger treatment) ──────────────────────
function LeadArticle({ item }: { item: NewsItem }) {
  const content = (
    <div className="group py-7">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <CategoryPill category={item.category} />
        <span className="text-[11px] text-[var(--biz-muted)]">{item.sourceLabel}</span>
        <span className="text-[var(--biz-muted)] opacity-30">·</span>
        <span className="text-[11px] text-[var(--biz-muted)]">{timeAgo(item.publishedAt)}</span>
      </div>
      <h2 className="text-[1.35rem] font-bold leading-snug tracking-tight text-[var(--biz-text)] transition-colors group-hover:text-blue-300">
        {item.title}
      </h2>
      <p className="mt-2.5 text-sm leading-relaxed text-[var(--biz-muted)] max-w-2xl">
        {item.snippet}
      </p>
      {item.url && (
        <span className="mt-3 inline-flex items-center gap-1 text-xs text-blue-400 transition-colors group-hover:text-blue-300">
          Read full article
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </span>
      )}
    </div>
  );

  return item.url
    ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">{content}</a>
    : <div>{content}</div>;
}

// ── Standard article row ──────────────────────────────────────────────────
function ArticleRow({ item }: { item: NewsItem }) {
  const content = (
    <div className="group flex gap-5 border-t border-[color:var(--biz-border)] py-5">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <CategoryPill category={item.category} />
          <span className="text-[11px] text-[var(--biz-muted)]">{item.sourceLabel}</span>
          <span className="text-[var(--biz-muted)] opacity-30">·</span>
          <span className="text-[11px] text-[var(--biz-muted)]">{timeAgo(item.publishedAt)}</span>
        </div>
        <h3 className="text-sm font-semibold leading-snug text-[var(--biz-text)] transition-colors group-hover:text-blue-300">
          {item.title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--biz-muted)] line-clamp-2">
          {item.snippet}
        </p>
      </div>
      {item.url && (
        <div className="mt-1 shrink-0 self-start">
          <svg className="h-3.5 w-3.5 text-[var(--biz-muted)] opacity-40 transition-opacity group-hover:opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      )}
    </div>
  );

  return item.url
    ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">{content}</a>
    : <div>{content}</div>;
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonRow({ tall }: { tall?: boolean }) {
  return (
    <div className={`py-5 ${tall ? "" : "border-t border-[color:var(--biz-border)]"} animate-pulse`}>
      <div className="mb-2 flex gap-2">
        <div className="h-4 w-16 rounded-full bg-white/[0.07]" />
        <div className="h-4 w-20 rounded bg-white/[0.04]" />
      </div>
      <div className={`h-5 rounded bg-white/[0.07] ${tall ? "w-4/5 mb-2" : "w-3/4"}`} />
      {tall && <div className="h-5 w-3/5 rounded bg-white/[0.05]" />}
      <div className="mt-2 h-3.5 w-full rounded bg-white/[0.04]" />
      <div className="mt-1 h-3.5 w-2/3 rounded bg-white/[0.03]" />
    </div>
  );
}

export default function NewsPage() {
  const [data, setData] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news");
      if (!res.ok) throw new Error("Failed to load news");
      setData(await res.json());
    } catch (e) {
      setError("Could not load news right now. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const allFeed = data?.feed ?? [];
  const filtered = activeCategory === "all"
    ? allFeed
    : allFeed.filter((item) => item.category === activeCategory);

  const [lead, ...rest] = filtered;

  const visibleCategories: Category[] = ["all", "industry", "grading", "market", "platform"];
  if (data?.isBusiness) visibleCategories.push("business");

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen" style={{ background: "var(--biz-bg, #0b1220)" }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="border-b border-[color:var(--biz-border)]">
          <div className="mx-auto max-w-4xl px-6 pb-0 pt-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
                  CardzCheck
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-[var(--biz-text)]">
                  News & Updates
                </h1>
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="mb-0.5 flex items-center gap-1.5 text-xs text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)] disabled:opacity-40"
              >
                <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {/* Category tabs */}
            <div className="mt-5 flex gap-0 overflow-x-auto">
              {visibleCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? "border-blue-500 text-[var(--biz-text)]"
                      : "border-transparent text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-6 py-0">

          {/* ── Announcements ──────────────────────────────────────────── */}
          {(data?.announcements?.length ?? 0) > 0 && (
            <div className="mt-8 mb-2">
              <p className="mb-0 text-[11px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
                Announcements
              </p>
              {data!.announcements.map((item, i) => (
                <AnnouncementRow key={item.id} item={item} isFirst={i === 0} />
              ))}
            </div>
          )}

          {/* ── Divider before feed ─────────────────────────────────── */}
          {(data?.announcements?.length ?? 0) > 0 && allFeed.length > 0 && (
            <div className="my-4 h-px bg-[color:var(--biz-border)]" />
          )}

          {/* ── Feed section header ─────────────────────────────────── */}
          {!loading && allFeed.length > 0 && (
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
              Industry news
            </p>
          )}

          {/* ── Loading skeletons ──────────────────────────────────────── */}
          {loading && (
            <>
              <SkeletonRow tall />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {/* ── Error ─────────────────────────────────────────────────── */}
          {!loading && error && (
            <div className="mt-10 text-center text-sm text-[var(--biz-muted)]">
              {error}
              <button onClick={load} className="mt-2 block w-full text-xs text-blue-400 hover:text-blue-300">
                Try again
              </button>
            </div>
          )}

          {/* ── Empty ─────────────────────────────────────────────────── */}
          {!loading && !error && filtered.length === 0 && (
            <p className="mt-10 text-center text-sm text-[var(--biz-muted)]">
              No articles in this category right now.
            </p>
          )}

          {/* ── Lead article ──────────────────────────────────────────── */}
          {!loading && lead && <LeadArticle item={lead} />}

          {/* ── Article list ──────────────────────────────────────────── */}
          {!loading && rest.map((item) => (
            <ArticleRow key={item.id} item={item} />
          ))}

          {/* ── Footer ────────────────────────────────────────────────── */}
          {!loading && (
            <div className="border-t border-[color:var(--biz-border)] py-8 mt-4">
              <p className="text-[11px] text-[var(--biz-muted)]">
                News sourced from third-party RSS feeds. CardzCheck is not responsible for external content.
                {data?.fetchedAt && (
                  <span className="ml-2">
                    Updated {timeAgo(data.fetchedAt)}.
                  </span>
                )}
              </p>
            </div>
          )}

        </div>
      </div>
    </AuthenticatedLayout>
  );
}
