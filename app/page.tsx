import RequestAccessForm from "@/components/landing/RequestAccessForm";

export const metadata = {
  title: "CardzCheck — Private Beta",
  description:
    "The intelligence platform for sports card collectors and businesses. Private beta launching soon.",
};

export default function ComingSoonPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white antialiased">
      {/* Faint dashboard mockup background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[60rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.025] blur-3xl"
      />

      <main className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-6 sm:px-10 sm:py-8">
          <span className="text-sm font-semibold tracking-[0.22em] text-white/80 uppercase">
            CardzCheck
          </span>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.22em] text-white/40 sm:inline">
            Private Beta · 2026
          </span>
        </header>

        {/* Hero */}
        <section className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
            {/* Status pill */}
            <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/70">
                Private Beta Launching Soon
              </span>
            </div>

            {/* Mark */}
            <div className="relative mb-10">
              <div
                aria-hidden
                className="absolute inset-0 -m-10 rounded-full bg-white/[0.07] blur-3xl"
              />
              <svg
                aria-hidden
                viewBox="0 0 64 64"
                className="relative h-12 w-12 text-white sm:h-14 sm:w-14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="10" y="6" width="36" height="50" rx="4" />
                <path d="M20 28l8 8 16-18" />
              </svg>
            </div>

            {/* Headline */}
            <h1
              className="relative text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl"
              style={{ textShadow: "0 0 40px rgba(255,255,255,0.18)" }}
            >
              CardzCheck
            </h1>

            {/* Subheadline */}
            <p className="mt-6 max-w-xl text-base text-white/70 sm:text-lg">
              The intelligence platform for sports card businesses.
            </p>

            {/* Divider */}
            <div className="my-10 h-px w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Body */}
            <p className="max-w-md text-sm leading-relaxed text-white/55 sm:text-[15px]">
              Grade probability. Business analytics. Marketplace infrastructure.{" "}
              <br className="hidden sm:block" />
              Built for the operators of the modern card market.
            </p>

            {/* Email form */}
            <div className="mt-12 w-full max-w-md">
              <RequestAccessForm />
              <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/30">
                Invitations released in waves.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative border-t border-white/5 px-6 py-6 sm:px-10">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-white/30 sm:flex-row">
            <p>© 2026 CardzCheck</p>
            <p className="hidden sm:block">Intelligence · Inventory · Insight</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
