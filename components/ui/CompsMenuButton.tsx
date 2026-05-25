"use client";

import { useEffect, useRef, useState } from "react";
import { buildMarketplaceLinks } from "@/lib/comps/marketplace-urls";
import type { CompsParams } from "@/lib/ebay/comps-url";

interface CompsMenuButtonProps {
  params: CompsParams;
  size?: "sm" | "default";
}

export default function CompsMenuButton({
  params,
  size = "default",
}: CompsMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const playerName = params.player ?? params.title ?? "";
  const links = buildMarketplaceLinks({
    playerName,
    year: params.year ?? null,
    setName: params.setName ?? null,
    grade: params.grade ?? null,
    gradingCompany: params.gradingCompany ?? null,
    parallelType: params.parallel ?? null,
  });

  const buttonClass =
    size === "sm"
      ? "inline-flex items-center gap-1 rounded border border-[#343941] bg-[#0F1317] px-2 py-1 text-[10px] font-medium text-[#B8C0CC] hover:text-[#E6E8EB] hover:border-[#5A626E] transition-colors"
      : "inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#1a2f4e] hover:bg-[#1e3a5f] border border-blue-900/40 text-blue-200 text-sm font-medium rounded-lg transition-colors";

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={buttonClass}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg
          className={size === "sm" ? "w-2.5 h-2.5 shrink-0" : "w-4 h-4 shrink-0"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Get Comps
        <svg
          className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-[#24282D] bg-[#0F1317] shadow-xl"
        >
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="flex items-start gap-3 px-3 py-2.5 hover:bg-[#1A1E24] transition-colors"
            >
              <span
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: link.accentColor }}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#E6E8EB]">
                  {link.name}
                </div>
                <div className="text-[11px] text-[#77808C]">
                  {link.tagline}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
