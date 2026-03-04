"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const SCAN_MESSAGES = [
  "Analyzing centering...",
  "Detecting surface imperfections...",
  "Evaluating edges...",
  "Checking corner sharpness...",
  "Measuring color consistency...",
  "Assessing print quality...",
];

interface CardScanOverlayProps {
  imageUrl: string | null;
}

export function CardScanOverlay({ imageUrl }: CardScanOverlayProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % SCAN_MESSAGES.length);
    }, 340);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* Card with scan effects */}
      <div
        className="relative shrink-0 rounded-xl overflow-hidden"
        style={{
          width: 128,
          height: 179,
          boxShadow: "0 0 28px rgba(59,130,246,0.18), 0 0 60px rgba(59,130,246,0.08)",
        }}
      >
        {/* Card image */}
        {imageUrl ? (
          <img src={imageUrl} alt="Card" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#0c1a2e]" />
        )}

        {/* Scan line */}
        <motion.div
          className="absolute inset-x-0 h-[2px] pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(147,197,253,0.0) 10%, rgba(147,197,253,0.7) 40%, rgba(96,165,250,1) 50%, rgba(147,197,253,0.7) 60%, rgba(147,197,253,0.0) 90%, transparent 100%)",
          }}
          animate={{ y: [0, 179, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />

        {/* Shimmer sweep */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(59,130,246,0.0) 0%, rgba(59,130,246,0.06) 50%, rgba(59,130,246,0.0) 100%)",
          }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Edge glow pulse */}
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.5)" }}
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Corner brackets */}
        {(
          [
            { top: 6, left: 6, deg: 0 },
            { top: 6, right: 6, deg: 90 },
            { bottom: 6, right: 6, deg: 180 },
            { bottom: 6, left: 6, deg: 270 },
          ] as Array<{ deg: number; top?: number; left?: number; right?: number; bottom?: number }>
        ).map(({ deg, ...posStyles }, i) => (
          <div
            key={i}
            className="absolute w-3.5 h-3.5 pointer-events-none"
            style={{
              ...posStyles,
              transform: `rotate(${deg}deg)`,
              borderTop: "1.5px solid rgba(96,165,250,0.8)",
              borderLeft: "1.5px solid rgba(96,165,250,0.8)",
            }}
          />
        ))}
      </div>

      {/* Cycling analysis message */}
      <div className="h-4 flex items-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="text-[11px] text-blue-400/80 text-center tracking-wide"
          >
            {SCAN_MESSAGES[msgIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
