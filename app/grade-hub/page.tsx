"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import MockSubmissionBuilder from "@/components/grading/MockSubmissionBuilder";

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-md border border-[#24282D] bg-[#0F1317] p-8"
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#77808C]">
          About
        </p>
        <h2 className="mb-4 text-[18px] font-semibold leading-tight text-[#E6E8EB]">
          Submission Builder
        </h2>
        <p className="mb-3 text-[13px] leading-relaxed text-[#B8C0CC]">
          Plan a grading submission before you send cards in. Pull cards from your ledger, pick a
          grading company, and enter the per-card cost and estimated turnaround.
        </p>
        <p className="mb-6 text-[13px] leading-relaxed text-[#B8C0CC]">
          Set an estimated graded value for each card to see the risk-to-reward — total
          investment, projected profit, and return on cost — then track each order through its
          lifecycle from draft to completed.
        </p>
        <p className="mb-6 border-t border-[#24282D] pt-3 text-[11px] text-[#77808C]">
          This is a planning and tracking tool. Values are your own estimates, not a predicted
          grade.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-[#343941] px-4 py-2 text-[11px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function GradeHubPage() {
  const { authUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const scope: "personal" | "business" = pathname?.startsWith("/business")
    ? "business"
    : "personal";

  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login");
  }, [authUser, authLoading, router]);

  return (
    <div className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      {/* Page header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
            Analytics
          </div>
          <h1 className="mt-0.5 flex items-center gap-3 text-[18px] font-semibold tracking-normal text-[#E6E8EB]">
            Grading
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C] hover:text-[#B8C0CC]"
            >
              About
            </button>
          </h1>
        </div>
        <p className="text-[11px] text-[#77808C]">
          Submission Builder · plan &amp; track grading orders
        </p>
      </header>

      <MockSubmissionBuilder scope={scope} />

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
