"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createClient } from "@/lib/supabase/client";

type InviteState = "loading" | "requires_auth" | "success" | "error";

export default function BusinessInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<InviteState>("loading");
  const [message, setMessage] = useState<string>("Checking invite...");

  const token = (searchParams.get("token") || "").trim();
  const redirectTarget = useMemo(
    () => `/business/invite?token=${encodeURIComponent(token)}`,
    [token]
  );

  useEffect(() => {
    async function run() {
      if (!token) {
        setState("error");
        setMessage("Invite token is missing.");
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setState("requires_auth");
        setMessage("Sign in to accept this team invite.");
        return;
      }

      const response = await fetch("/api/business/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setState("error");
        setMessage(
          (typeof data?.error === "string" && data.error) ||
            "Unable to accept invite."
        );
        return;
      }

      setState("success");
      setMessage("Invite accepted. Redirecting to your business workspace...");
      setTimeout(() => router.replace("/business?invite=accepted"), 800);
    }

    run();
  }, [router, token]);

  return (
    <AuthenticatedLayout>
      <main className="mx-auto max-w-xl px-4 py-14">
        <section className="rounded-2xl border border-[color:var(--biz-border)] bg-[var(--biz-surface)] p-6">
          <h1 className="text-2xl font-semibold text-[var(--biz-text)]">
            Business Team Invite
          </h1>
          <p className="mt-2 text-sm text-[var(--biz-muted)]">{message}</p>

          {state === "requires_auth" && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
                className="rounded-lg bg-[var(--biz-primary)] px-4 py-2 text-sm font-semibold text-[#0F172A]"
              >
                Sign In
              </Link>
              <Link
                href={`/signup?redirect=${encodeURIComponent(redirectTarget)}`}
                className="rounded-lg border border-[color:var(--biz-border)] px-4 py-2 text-sm font-semibold text-[var(--biz-text)]"
              >
                Create Account
              </Link>
            </div>
          )}

          {state === "error" && (
            <div className="mt-5">
              <Link
                href="/business/settings"
                className="text-sm font-medium text-[var(--biz-primary)] hover:underline"
              >
                Back to Business Settings
              </Link>
            </div>
          )}
        </section>
      </main>
    </AuthenticatedLayout>
  );
}

