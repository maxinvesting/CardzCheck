"use client";

import { motion } from "framer-motion";

interface SlabFrameProps {
  imageUrl: string | null;
  isLoading: boolean;
  children?: React.ReactNode;
}

export function SlabFrame({ imageUrl, isLoading, children }: SlabFrameProps) {
  return (
    <div className="flex flex-col items-center">
      {/* Slab container */}
      <div className="relative" style={{ width: 200 }}>
        {/* Top slab label — slides in from above */}
        <motion.div
          initial={{ y: -44, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 px-4 py-2.5 rounded-t-2xl"
          style={{
            background: "linear-gradient(135deg, #0f1f35 0%, #0c1a2e 100%)",
            borderTop: "1px solid rgba(255,255,255,0.10)",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            borderRight: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7a91a8]"
            >
              CardzCheck
            </span>
            <span className="text-[8px] uppercase tracking-[0.14em] text-blue-400/70">
              AI Estimate
            </span>
          </div>
          {/* Subtle reflection line */}
          <div
            className="absolute inset-x-4 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
            }}
          />
        </motion.div>

        {/* Card image section */}
        <motion.div
          initial={{ scaleX: 0.88, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.38, ease: "easeOut" }}
          className="relative z-0 overflow-hidden"
          style={{
            height: 224,
            background: "#060f1a",
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            borderRight: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Card"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full" />
          )}
          {/* Inner shadow overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow: "inset 0 8px 20px rgba(0,0,0,0.5), inset 0 -8px 20px rgba(0,0,0,0.3)",
            }}
          />
          {/* Acrylic sheen */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%)",
            }}
          />
        </motion.div>

        {/* Bottom slab section — slides in from below */}
        <motion.div
          initial={{ y: 44, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 px-4 py-2.5 rounded-b-2xl"
          style={{
            background: "linear-gradient(135deg, #0c1a2e 0%, #0a1625 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            borderRight: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[8px] uppercase tracking-[0.14em] text-[#3a5068]">
              Grade Probability Engine
            </span>
            {isLoading ? (
              <div className="flex items-center gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full bg-blue-400/50"
                    animate={{ opacity: [0.3, 0.9, 0.3] }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.18,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-1.5 h-1.5 rounded-full bg-emerald-400/70"
              />
            )}
          </div>
        </motion.div>

        {/* Slab outer glow */}
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            boxShadow: "0 0 40px rgba(59,130,246,0.07), 0 0 80px rgba(59,130,246,0.04)",
          }}
        />
      </div>

      {/* Content area below slab */}
      {children}

      {/* Legal disclaimer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="mt-3 text-[9px] text-[#3a5068] text-center tracking-wide"
      >
        AI estimate. Not affiliated with PSA, BGS, or SGC.
      </motion.p>
    </div>
  );
}
