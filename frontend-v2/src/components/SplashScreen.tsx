"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

interface SplashScreenProps {
  onComplete?: () => void;
  durationMs?: number;
}

export default function SplashScreen({
  onComplete,
  durationMs = 1400,
}: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / durationMs) * 100));
      setProgress(pct);

      if (elapsed >= durationMs) {
        clearInterval(interval);
        setProgress(100);
        setIsFadingOut(true);
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 300);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [durationMs, onComplete]);

  return (
    <AnimatePresence>
      {!isFadingOut ? (
        <motion.div
          key="stake-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col justify-between items-center select-none overflow-hidden"
          style={{
            backgroundColor: "#050505",
            color: "#FFFFFF",
          }}
        >
          {/* ==========================================================
              1. Ambient Background Layer (Matte Black + Subtle Luminescence)
              ========================================================== */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Very Subtle Deep Red Ambient Vignette */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full blur-[130px] opacity-25"
              style={{
                background:
                  "radial-gradient(circle, rgba(255, 59, 48, 0.4) 0%, rgba(20, 20, 25, 0.1) 60%, transparent 80%)",
              }}
            />

            {/* Subtle Specular Horizon */}
            <div
              className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[180px] blur-[90px] opacity-15"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(255, 255, 255, 0.2) 0%, transparent 70%)",
              }}
            />
          </div>

          {/* Top Balance Spacer (Ensures True Center) */}
          <div className="w-full pt-12 sm:pt-16" aria-hidden="true" />

          {/* ==========================================================
              2. Center Hero: Glass ECG Icon + Native EMEFast Logo + Progress
              ========================================================== */}
          <div className="relative z-10 flex flex-col items-center justify-center px-6 -mt-4 sm:-mt-6">
            {/* Center App Logo Hero */}
            <div className="relative mb-6 sm:mb-7 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#FF3B30]/35 rounded-3xl blur-2xl scale-110 pointer-events-none" />
              <Image
                src="/app-logo.png"
                alt="EMEFast Logo"
                width={88}
                height={88}
                priority
                className="relative z-10 w-20 h-20 sm:w-22 sm:h-22 rounded-[20px] shadow-[0_16px_40px_rgba(255,59,48,0.35),0_8px_24px_rgba(0,0,0,0.85)]"
              />
            </div>

            {/* Native Text Wordmark: EME (titanium) + Fast (emergency red) */}
            <div className="flex items-baseline font-black italic select-none">
              {/* EME -> brushed titanium gradient */}
              <span
                className="text-4xl sm:text-5xl font-black"
                style={{
                  background:
                    "linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 40%, #94A3B8 75%, #64748B 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))",
                  letterSpacing: "-0.04em",
                }}
              >
                EME
              </span>

              {/* Fast -> luminous emergency red gradient */}
              <div className="relative inline-flex items-baseline ml-1">
                <span
                  className="text-4xl sm:text-5xl font-black"
                  style={{
                    background:
                      "linear-gradient(180deg, #FF453A 0%, #FF2D55 45%, #D70015 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 18px rgba(255, 59, 48, 0.75))",
                    letterSpacing: "-0.04em",
                  }}
                >
                  Fast
                </span>

                {/* Subtle speed streak */}
                <div className="absolute -right-6 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-none opacity-80">
                  <span className="w-5 h-[2px] rounded-full bg-gradient-to-r from-[#FF3B30] to-transparent shadow-[0_0_8px_#FF3B30]" />
                  <span className="w-7 h-[2px] rounded-full bg-gradient-to-r from-[#FF453A] to-transparent shadow-[0_0_10px_#FF3B30]" />
                </div>
              </div>
            </div>

            {/* Subtitle: Emergency Coordination */}
            <p className="mt-2.5 text-[11px] sm:text-xs font-semibold tracking-[0.26em] uppercase text-neutral-400">
              Emergency Coordination
            </p>

            {/* ==========================================================
                3. Thin Animated Progress Line + Status
                ========================================================== */}
            <div className="mt-8 sm:mt-9 w-60 sm:w-68 flex flex-col items-center">
              {/* Thin Animated Progress Line (3px) */}
              <div className="relative w-full h-[3px] rounded-full bg-white/10 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                <div
                  className="h-full rounded-full relative"
                  style={{
                    width: `${progress}%`,
                    background:
                      "linear-gradient(90deg, #D70015 0%, #FF3B30 60%, #FF453A 100%)",
                    boxShadow:
                      "0 0 12px #FF3B30, 0 0 24px rgba(255, 59, 48, 0.8)",
                  }}
                >
                  {/* Traveling light shimmer */}
                  <motion.div
                    animate={{ x: ["-100%", "250%"] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 w-10 bg-gradient-to-r from-transparent via-white/90 to-transparent"
                  />
                </div>
              </div>

              {/* Status Row */}
              <div className="w-full mt-3.5 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 text-neutral-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] shadow-[0_0_6px_#FF3B30] animate-pulse" />
                  <span className="font-medium tracking-wide">
                    Synchronizing hospital network
                  </span>
                </div>
                <span className="font-mono text-neutral-400 font-semibold tabular-nums">
                  {progress}%
                </span>
              </div>
            </div>
          </div>

          {/* ==========================================================
              4. Bottom Tagline: "Every Second Matters"
              ========================================================== */}
          <div className="pb-10 sm:pb-12 text-center relative z-10">
            <p className="text-[11px] sm:text-xs font-medium tracking-[0.24em] text-neutral-500 uppercase">
              Every Second Matters
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
