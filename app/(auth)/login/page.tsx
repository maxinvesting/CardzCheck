"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SportsCardBackground from "@/components/SportsCardBackground";
import { hasActiveBusinessTier } from "@/lib/subscription-tier";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Ensure we have a session before redirecting
    if (data.session) {
      let redirectTarget = redirectParam || "/dashboard";

      if (!redirectParam && data.user) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("tier, status, current_period_end")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (hasActiveBusinessTier(sub)) {
          redirectTarget = "/business";
        }
      }

      // Small delay to ensure cookies are written
      setTimeout(() => {
        // Force a hard navigation to ensure cookies are set
        window.location.href = redirectTarget;
      }, 100);
    } else {
      setError("Login successful but session not created. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0f1419] px-4">
      <SportsCardBackground variant="subtle" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <aside className="hidden rounded-2xl border border-gray-800 bg-gray-900/70 p-8 lg:block">
            <Link href="/" className="inline-flex items-center text-2xl font-bold tracking-tight text-white">
              CardzCheck
            </Link>
            <h1 className="mt-6 text-3xl font-semibold leading-tight text-white">
              Welcome back.
              <br />
              Your dashboard is ready.
            </h1>
            <p className="mt-4 text-sm text-gray-400">
              Sign in to continue tracking values, running comps, and managing your collection.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-300">
              <li className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                Real-time comps and value tracking
              </li>
              <li className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                Photo-based card identification
              </li>
              <li className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                Collection analytics and watchlists
              </li>
            </ul>
          </aside>

          <section className="w-full rounded-2xl border border-gray-800 bg-gray-900/85 p-6 shadow-2xl shadow-black/20 sm:p-8">
            <div className="text-center lg:hidden">
              <Link href="/" className="inline-flex items-center text-2xl font-bold tracking-tight text-white">
                CardzCheck
              </Link>
            </div>

            <h2 className="mt-4 text-center text-2xl font-semibold text-white lg:mt-0 lg:text-left">
              Sign in to your account
            </h2>
            {redirectParam ? (
              <p className="mt-2 text-center text-sm text-blue-300 lg:text-left">
                Sign in to continue to your requested page.
              </p>
            ) : (
              <p className="mt-2 text-center text-sm text-gray-400 lg:text-left">
                Use the same account you use in the app dashboard.
              </p>
            )}

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              {error ? (
                <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              ) : null}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950/60 px-4 py-3 text-white placeholder-gray-500 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950/60 px-4 py-3 text-white placeholder-gray-500 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="Your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>

              <p className="text-center text-sm text-gray-400">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="font-medium text-blue-400 hover:text-blue-300">
                  Sign up
                </Link>
              </p>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
