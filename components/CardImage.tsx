"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrustedCardImage } from "@/types";
import { buildClientImageUrl } from "@/lib/images/shared";

interface CardImageProps {
  image?: TrustedCardImage | null;
  alt: string;
  className?: string;
  aspectClassName?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  loading?: "lazy" | "eager";
  allowUploadCta?: boolean;
  ctaLabel?: string;
  onCtaClick?: () => void;
}

export function CardImage({
  image,
  alt,
  className = "",
  aspectClassName = "aspect-[3/4]",
  imageClassName = "",
  fallbackClassName = "",
  loading = "lazy",
  allowUploadCta = false,
  ctaLabel = "Add image",
  onCtaClick,
}: CardImageProps) {
  const candidates = useMemo(
    () => (image?.frontCandidates ?? []).map((candidate) => buildClientImageUrl(candidate) ?? candidate),
    [image]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasExhaustedCandidates, setHasExhaustedCandidates] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setHasExhaustedCandidates(false);
  }, [candidates.length, image?.frontUrl]);

  const imageUrl = hasExhaustedCandidates ? null : candidates[candidateIndex] ?? null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${aspectClassName} ${className}`.trim()}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          loading={loading}
          className={`h-full w-full object-contain ${imageClassName}`.trim()}
          onError={() => {
            setCandidateIndex((current) => {
              const next = current + 1;
              if (next < candidates.length) {
                return next;
              }
              setHasExhaustedCandidates(true);
              return current;
            });
          }}
        />
      ) : (
        <div
          className={`flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center ${fallbackClassName}`.trim()}
        >
          <div className="rounded-[18px] border border-dashed border-slate-300 bg-white/70 px-6 py-8 shadow-sm">
            <p className="text-sm font-medium text-slate-600">No image available</p>
            {allowUploadCta && onCtaClick ? (
              <button
                type="button"
                onClick={onCtaClick}
                className="mt-3 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100"
              >
                {ctaLabel}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
