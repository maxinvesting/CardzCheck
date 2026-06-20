import Link from "next/link";
import AssistantIcon from "@/components/assistants/AssistantIcon";
import {
  ASSISTANTS,
  PLANNED_ASSISTANTS,
  type AssistantDef,
} from "@/lib/assistants/registry";

// Assistants landing — the entry point into CardzCheck's suite of specialized
// AI tools for dealers. Institutional / terminal aesthetic: dense, structured,
// high-trust. Not a consumer chatbot hub.

export const metadata = {
  title: "Assistants · CardzCheck",
  description:
    "Specialized tools for sports-card dealers — advisory, sales, pricing, grading, and more.",
};

function LiveCard({ a }: { a: AssistantDef }) {
  return (
    <Link
      href={a.href}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-5 transition-colors hover:border-[var(--biz-border-strong)] hover:bg-[var(--biz-surface-raised)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--biz-border-strong)] bg-[var(--biz-surface-soft)] text-[var(--biz-text-strong)]">
          <AssistantIcon icon={a.icon} className="h-5 w-5" />
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted-strong)]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      </div>

      <h2 className="mt-4 text-[15px] font-semibold tracking-tight text-[var(--biz-text-strong)]">
        {a.name}
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--biz-muted)]">
        {a.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {a.tags.map((tag) => (
          <span
            key={tag}
            className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-muted-strong)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--biz-text)] transition-colors group-hover:text-[var(--biz-text-strong)]">
        Open assistant
        <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </Link>
  );
}

function PlannedCard({ a }: { a: AssistantDef }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-dashed border-[var(--biz-border)] bg-[var(--biz-surface)]/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] text-[var(--biz-muted)]">
          <AssistantIcon icon={a.icon} className="h-5 w-5" />
        </span>
        <span className="rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
          Coming soon
        </span>
      </div>
      <h2 className="mt-4 text-[15px] font-semibold tracking-tight text-[var(--biz-muted-strong)]">
        {a.name}
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--biz-muted)]">
        {a.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {a.tags.map((tag) => (
          <span
            key={tag}
            className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)]/60 px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AssistantsLandingPage() {
  return (
    <main className="relative min-h-screen text-[var(--biz-text)]">
      <div className="relative mx-auto max-w-[80rem] px-4 py-6 sm:px-6 lg:px-8">
        {/* Masthead */}
        <header className="pb-5 mb-6 border-b border-[var(--biz-border)]">
          <div className="flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--biz-muted)]">
              Assistants
            </span>
          </div>
          <h1 className="mt-2 text-[26px] font-medium leading-[1.1] tracking-tight text-[var(--biz-text-strong)] sm:text-[30px]">
            Your business operating system
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--biz-muted)]">
            A suite of specialized assistants built for sports-card dealers —
            each focused on a part of the business, from advisory and sales to
            pricing, grading, and inventory.
          </p>
        </header>

        {/* Live assistants */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)]">
            Available now
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ASSISTANTS.map((a) => (
              <LiveCard key={a.id} a={a} />
            ))}
          </div>
        </section>

        {/* Roadmap */}
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)]">
            On the roadmap
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PLANNED_ASSISTANTS.map((a) => (
              <PlannedCard key={a.id} a={a} />
            ))}
          </div>
        </section>

        {/* Transparency disclaimer */}
        <p className="mt-8 border-t border-[var(--biz-border)] pt-4 text-[11px] leading-5 text-[var(--biz-faint)]">
          Assistants are AI-powered and may make mistakes. Verify important
          numbers and decisions before acting on them.
        </p>
      </div>
    </main>
  );
}
