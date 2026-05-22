"use client";

interface SportsCardBackgroundProps {
  variant?: "default" | "subtle" | "hero";
}

export default function SportsCardBackground({
  variant = "default",
}: SportsCardBackgroundProps) {
  const opacity = {
    default: {
      lines: "opacity-[0.05]",
      cards: "opacity-[0.18]",
      shimmer: "opacity-[0.04]",
    },
    subtle: {
      lines: "opacity-[0.03]",
      cards: "opacity-[0.12]",
      shimmer: "opacity-[0.03]",
    },
    hero: {
      lines: "opacity-[0.06]",
      cards: "opacity-[0.22]",
      shimmer: "opacity-[0.05]",
    },
  }[variant];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className={`absolute inset-0 ${opacity.lines}`}
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 8px,
            rgba(255, 255, 255, 0.06) 8px,
            rgba(255, 255, 255, 0.06) 9px
          )`,
        }}
      />
      <div
        className={`absolute inset-0 ${opacity.lines}`}
        style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 12px,
            rgba(255, 255, 255, 0.04) 12px,
            rgba(255, 255, 255, 0.04) 13px
          )`,
        }}
      />

      <div
        className={`absolute -top-20 -right-20 w-64 h-80 border border-white/[0.08] rounded-2xl rotate-12 ${opacity.cards}`}
      />
      <div
        className={`absolute -top-16 -right-16 w-56 h-72 border border-white/[0.06] rounded-2xl rotate-12 ${opacity.cards}`}
      />
      <div
        className={`absolute -top-12 -right-12 w-48 h-64 border border-white/[0.05] rounded-2xl rotate-12 ${opacity.cards}`}
      />

      <div
        className={`absolute -bottom-24 -left-16 w-52 h-68 border border-white/[0.07] rounded-2xl -rotate-12 ${opacity.cards}`}
      />
      <div
        className={`absolute -bottom-20 -left-12 w-44 h-60 border border-white/[0.05] rounded-2xl -rotate-12 ${opacity.cards}`}
      />

      <div
        className={`absolute top-1/3 -left-10 w-40 h-56 border border-white/[0.05] rounded-xl rotate-6 ${opacity.cards}`}
      />
      <div
        className={`absolute bottom-1/4 -right-8 w-36 h-48 border border-white/[0.05] rounded-xl -rotate-6 ${opacity.cards}`}
      />

      <div
        className={`absolute top-1/4 right-0 w-96 h-96 ${opacity.shimmer}`}
        style={{
          background: `radial-gradient(ellipse at center, rgba(255, 255, 255, 0.06) 0%, transparent 70%)`,
        }}
      />
      <div
        className={`absolute bottom-1/4 left-0 w-80 h-80 ${opacity.shimmer}`}
        style={{
          background: `radial-gradient(ellipse at center, rgba(255, 255, 255, 0.05) 0%, transparent 70%)`,
        }}
      />
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] ${opacity.shimmer}`}
        style={{
          background: `radial-gradient(ellipse at center, rgba(255, 255, 255, 0.04) 0%, transparent 60%)`,
        }}
      />

      {variant === "hero" && (
        <>
          <div
            className="absolute top-0 left-1/4 w-px h-full opacity-[0.06]"
            style={{
              background: `linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.12) 30%, rgba(255, 255, 255, 0.12) 70%, transparent)`,
            }}
          />
          <div
            className="absolute top-0 right-1/4 w-px h-full opacity-[0.06]"
            style={{
              background: `linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.12) 30%, rgba(255, 255, 255, 0.12) 70%, transparent)`,
            }}
          />
        </>
      )}
    </div>
  );
}
