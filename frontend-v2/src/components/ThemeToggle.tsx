"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const active = document.documentElement.classList.contains("theme-light");
    setIsLight(active);
    setMounted(true);

    const handleThemeChange = (e: Event) => {
      const custom = e as CustomEvent<{ theme: string }>;
      if (custom?.detail?.theme) {
        setIsLight(custom.detail.theme === "light");
      }
    };

    window.addEventListener("emefast-theme-change", handleThemeChange);
    return () => window.removeEventListener("emefast-theme-change", handleThemeChange);
  }, []);

  const toggle = () => {
    const next = !isLight;
    const root = document.documentElement;

    if (next) {
      root.classList.add("theme-light");
      root.classList.remove("theme-dark");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
      localStorage.setItem("emefast-theme", "light");
    } else {
      root.classList.remove("theme-light");
      root.classList.add("theme-dark");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
      localStorage.setItem("emefast-theme", "dark");
    }

    setIsLight(next);
    window.dispatchEvent(
      new CustomEvent("emefast-theme-change", { detail: { theme: next ? "light" : "dark" } })
    );
  };

  const lightActive = mounted ? isLight : false;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={lightActive}
      aria-label={lightActive ? "Switch to dark mode" : "Switch to light mode"}
      title={lightActive ? "Switch to dark mode" : "Switch to light mode"}
      className={`liquid-glass-toggle ${lightActive ? "is-light" : "is-dark"}`}
      onClick={toggle}
      suppressHydrationWarning
    >
      {/* Track Label */}
      <span className="toggle-track-label" aria-hidden="true">
        {lightActive ? "Light" : "Dark"}
      </span>

      {/* Sliding Liquid Glass Lens Knob */}
      <span className="toggle-lens-knob" aria-hidden="true">
        <span className="lens-refraction-sheen" />
        {lightActive ? (
          <Sun size={13} strokeWidth={2.4} className="toggle-glyph sun-glyph" />
        ) : (
          <Moon size={12} strokeWidth={2.4} className="toggle-glyph moon-glyph" />
        )}
      </span>
    </button>
  );
}
