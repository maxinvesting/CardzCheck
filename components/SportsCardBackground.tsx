"use client";

interface SportsCardBackgroundProps {
  variant?: "default" | "subtle" | "hero";
}

export default function SportsCardBackground({
  variant = "default",
}: SportsCardBackgroundProps) {
  const opacity = {
    default: {
      lines: "opacity-[0.06]",
      cards: "opacity-40",
      shimmer: "opacity-[0.08]",
    },
    subtle: {
      lines: "opacity-[0.04]",
      cards: "opacity-30",
      shimmer: "opacity-[0.05]",
    },
    hero: {
      lines: "opacity-[0.08]",
      cards: "opacity-50",
      shimmer: "opacity-[0.10]",
    },
  }[variant];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Diagonal lines like card texture / refractor pattern */}
      <div
        className={`absolute inset-0 ${opacity.lines}`}
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 8px,
            rgba(139, 92, 246, 0.7) 8px,
            rgba(139, 92, 246, 0.7) 9px
          )`,
        }}
      />
      {/* Secondary cross-hatch pattern */}
      <div
        className={`absolute inset-0 ${opacity.lines}`}
        style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 12px,
            rgba(59, 130, 246, 0.5) 12px,
            rgba(59, 130, 246, 0.5) 13px
          )`,
        }}
      />

      {/* Corner card shapes - stacked cards effect */}
      <div
        className={`absolute -top-20 -right-20 w-64 h-80 border-2 border-purple-500/40 rounded-2xl rotate-12 ${opacity.cards}`}
        style={{ boxShadow: "0 0 40px rgba(139, 92, 246, 0.15)" }}
      />
      <div
        className={`absolute -top-16 -right-16 w-56 h-72 border-2 border-purple-500/30 rounded-2xl rotate-12 ${opacity.cards}`}
      />
      <div
        className={`absolute -top-12 -right-12 w-48 h-64 border border-purple-400/20 rounded-2xl rotate-12 ${opacity.cards}`}
      />

      {/* Bottom left cards */}
      <div
        className={`absolute -bottom-24 -left-16 w-52 h-68 border-2 border-blue-500/40 rounded-2xl -rotate-12 ${opacity.cards}`}
        style={{ boxShadow: "0 0 40px rgba(59, 130, 246, 0.15)" }}
      />
      <div
        className={`absolute -bottom-20 -left-12 w-44 h-60 border-2 border-blue-500/30 rounded-2xl -rotate-12 ${opacity.cards}`}
      />

      {/* Additional floating cards */}
      <div
        className={`absolute top-1/3 -left-10 w-40 h-56 border border-purple-400/25 rounded-xl rotate-6 ${opacity.cards}`}
      />
      <div
        className={`absolute bottom-1/4 -right-8 w-36 h-48 border border-blue-400/25 rounded-xl -rotate-6 ${opacity.cards}`}
      />

      {/* Holographic shimmer effects */}
      <div
        className={`absolute top-1/4 right-0 w-96 h-96 ${opacity.shimmer}`}
        style={{
          background: `radial-gradient(ellipse at center, rgba(139, 92, 246, 0.5) 0%, transparent 70%)`,
        }}
      />
      <div
        className={`absolute bottom-1/4 left-0 w-80 h-80 ${opacity.shimmer}`}
        style={{
          background: `radial-gradient(ellipse at center, rgba(59, 130, 246, 0.5) 0%, transparent 70%)`,
        }}
      />
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] ${opacity.shimmer}`}
        style={{
          background: `radial-gradient(ellipse at center, rgba(168, 85, 247, 0.3) 0%, transparent 60%)`,
        }}
      />

      {/* Additional accent for hero variant */}
      {variant === "hero" && (
        <>
          <div
            className="absolute top-0 left-1/4 w-px h-full opacity-10"
            style={{
              background: `linear-gradient(to bottom, transparent, rgba(139, 92, 246, 0.5) 30%, rgba(139, 92, 246, 0.5) 70%, transparent)`,
            }}
          />
          <div
            className="absolute top-0 right-1/4 w-px h-full opacity-10"
            style={{
              background: `linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.5) 30%, rgba(59, 130, 246, 0.5) 70%, transparent)`,
            }}
          />
        </>
      )}
    </div>
  );
}
