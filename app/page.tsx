"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/client";
import { hasActiveBusinessTier } from "@/lib/subscription-tier";

// ─── Shared icon ──────────────────────────────────────────────────────────────

function Check({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── Hero: product analysis mockup ───────────────────────────────────────────

function AnalysisMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-8 bg-blue-600/6 rounded-3xl blur-3xl pointer-events-none" />
      <div className="relative bg-[#141c27] border border-gray-700/50 rounded-2xl p-5 shadow-2xl w-72">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
            Card Analysis
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-green-500/15 text-green-400 rounded-full font-semibold">
            Complete
          </span>
        </div>

        {/* Identity */}
        <div className="pb-4 mb-4 border-b border-gray-800">
          <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">Identified</p>
          <p className="text-white font-bold text-base leading-tight">Shohei Ohtani</p>
          <p className="text-gray-400 text-sm mt-0.5">2018 Topps Chrome · #150</p>
          <p className="text-gray-500 text-xs mt-0.5">Base Refractor · RC</p>
        </div>

        {/* Grade probability */}
        <div className="pb-4 mb-4 border-b border-gray-800">
          <p className="text-[10px] text-gray-500 mb-3 uppercase tracking-wide">Grade probability</p>
          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-300 font-medium">PSA 10</span>
                <span className="text-blue-400 font-semibold">74%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: "74%" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">PSA 9</span>
                <span className="text-gray-500 font-medium">22%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gray-600 rounded-full" style={{ width: "22%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Value context */}
        <div className="pb-4 mb-4 border-b border-gray-800">
          <p className="text-[10px] text-gray-500 mb-2.5 uppercase tracking-wide">Value context</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Raw value</p>
              <p className="text-white font-bold">~$85</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">PSA 10 value</p>
              <p className="text-white font-bold">~$420</p>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
          <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <Check className="w-3.5 h-3.5 text-green-400" />
          </div>
          <div>
            <p className="text-green-400 text-sm font-bold">Grade it</p>
            <p className="text-gray-500 text-xs">Strong upside after fees</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("tier, status, current_period_end")
          .eq("user_id", user.id)
          .maybeSingle();

        if (hasActiveBusinessTier(subscription)) {
          router.replace("/business");
          return;
        }
        router.replace("/dashboard");
      } else {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0f1419] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1419] text-white">
      <Header />

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none select-none">
          <div className="absolute top-0 left-1/3 w-[500px] h-[400px] bg-blue-600/7 rounded-full blur-3xl" />
          <div className="absolute top-10 right-1/4 w-80 h-80 bg-purple-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            {/* Copy */}
            <div>
              <h1 className="text-4xl md:text-5xl lg:text-[52px] font-bold text-white leading-[1.1] tracking-tight">
                Know what your cards<br className="hidden sm:block" />
                are actually worth
              </h1>
              <p className="mt-6 text-lg text-gray-400 leading-relaxed max-w-lg">
                CardzCheck uses AI to identify sports cards, estimate grading
                potential, and evaluate value — so you can decide whether to
                grade, sell, or hold.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="px-7 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-base text-center"
                >
                  Start Free
                </Link>
                <a
                  href="#how-it-works"
                  className="px-7 py-3.5 border border-gray-700 text-gray-300 font-semibold rounded-xl hover:border-gray-500 hover:text-white transition-colors text-base text-center"
                >
                  See How It Works
                </a>
              </div>
              <p className="mt-4 text-sm text-gray-600">No credit card required</p>
            </div>

            {/* Mockup */}
            <div className="flex justify-center lg:justify-end">
              <AnalysisMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          PROBLEM
      ══════════════════════════════════════════════════ */}
      <section className="border-t border-gray-800/60 bg-[#0c1118] py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="max-w-2xl mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Most people are guessing.
            </h2>
            <p className="mt-4 text-gray-400 text-lg leading-relaxed">
              Grading the wrong cards wastes money. CardzCheck helps you make
              those decisions with more confidence.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                q: "Is this card worth grading?",
                a: "Grading fees eat into margins fast. Without knowing the upside, you're taking a blind shot.",
              },
              {
                q: "What grade is it likely to get?",
                a: "Centering, corners, and surface flaws all affect outcome — and they're easy to misjudge without a trained eye.",
              },
              {
                q: "Will the upside justify the fees?",
                a: "The math only works if the graded value meaningfully clears the cost of submission.",
              },
              {
                q: "Should I sell raw instead?",
                a: "Sometimes raw is the smarter move. Knowing that before you submit saves real money.",
              },
            ].map(({ q, a }) => (
              <div
                key={q}
                className="bg-[#141c27] border border-gray-800/50 rounded-xl p-5"
              >
                <p className="text-white font-semibold mb-1.5">{q}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          CAPABILITIES
      ══════════════════════════════════════════════════ */}
      <section className="border-t border-gray-800/60 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-12">
            What CardzCheck helps you do
          </h2>

          <div className="grid md:grid-cols-3 gap-5">
            {/* Identify */}
            <div className="bg-[#141c27] border border-gray-800/50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center mb-5">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">
                Identify your card
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Upload photos and CardzCheck helps identify the player, set,
                year, parallel, and card details faster.
              </p>
            </div>

            {/* Grade */}
            <div className="bg-[#141c27] border border-gray-800/50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-amber-500/15 rounded-xl flex items-center justify-center mb-5">
                <svg
                  className="w-5 h-5 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">
                Estimate grading potential
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Analyze centering, corners, edges, and surface quality to
                understand likely grading outcomes before submitting.
              </p>
            </div>

            {/* Value */}
            <div className="bg-[#141c27] border border-gray-800/50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-green-500/15 rounded-xl flex items-center justify-center mb-5">
                <svg
                  className="w-5 h-5 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">
                Evaluate value and next move
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Review value context and grading upside so you can decide
                whether to grade, sell, or hold.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SELLER / BUSINESS
      ══════════════════════════════════════════════════ */}
      <section className="border-t border-gray-800/60 bg-[#0c1118] py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Built for sellers too
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                Whether you're processing a stack of cards or running a full
                inventory operation, CardzCheck supports higher-volume
                workflows built around profit-minded decisions.
              </p>
              <ul className="space-y-3.5">
                {[
                  "Bulk card identification and processing",
                  "Pricing support across your inventory",
                  "Grade or sell-raw decisions at scale",
                  "Listing workflow support",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 mt-0.5 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-400" />
                    </div>
                    <span className="text-gray-300 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bulk workflow preview */}
            <div className="bg-[#141c27] border border-gray-800/50 rounded-2xl p-6">
              <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-6">
                Bulk workflow
              </p>
              <div className="space-y-3">
                {[
                  { label: "Cards uploaded", value: "48" },
                  { label: "Identified", value: "48 / 48", highlight: "text-green-400" },
                  { label: "Grade worthy", value: "12 cards" },
                  { label: "Sell raw", value: "36 cards" },
                  { label: "Est. profit upside", value: "$1,240+", highlight: "text-blue-400" },
                ].map(({ label, value, highlight }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center py-2.5 border-b border-gray-800/50 last:border-0"
                  >
                    <span className="text-gray-500 text-sm">{label}</span>
                    <span
                      className={`text-sm font-semibold ${highlight ?? "text-white"}`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════ */}
      <section id="how-it-works" className="border-t border-gray-800/60 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-14 text-center">
            How it works
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Upload card photos",
                desc: "Front and back photos give the AI the detail it needs to work accurately.",
              },
              {
                step: "02",
                title: "AI identifies and analyzes",
                desc: "CardzCheck identifies the card and evaluates condition across key grading criteria.",
              },
              {
                step: "03",
                title: "Review grade and value insights",
                desc: "See grade probability, estimated raw and graded values, and relevant market context.",
              },
              {
                step: "04",
                title: "Decide: grade, sell, or hold",
                desc: "Make the call with more context than you had before.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step}>
                <p className="text-5xl font-bold text-gray-800/70 leading-none mb-4 select-none tabular-nums">
                  {step}
                </p>
                <h3 className="text-white font-semibold mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════ */}
      <section className="border-t border-gray-800/60 bg-[#0c1118] py-20">
        <div className="max-w-xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Start using CardzCheck
          </h2>
          <p className="mt-4 text-gray-400 text-lg">
            Make better grading and selling decisions with clearer card
            analysis.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-block px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-base"
            >
              Start Free
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer className="border-t border-gray-800/60 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
          <span className="font-bold text-white text-lg">CardzCheck</span>
          <p>AI-powered card analysis for collectors and sellers.</p>
          <div className="flex gap-5">
            <Link href="/terms" className="hover:text-gray-300 transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
