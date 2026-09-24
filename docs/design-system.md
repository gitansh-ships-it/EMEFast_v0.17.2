# EMEFast Design System Specification

## 1. Visual Philosophy: Apple Liquid Glass × Lucid Frost

EMEFast adopts a high-contrast dark aesthetic optimized for high-stress emergency coordination environments. It combines deep matte black foundations (`#050505`) with Apple-inspired translucent glass controls, specular borders, and luminous red emergency accents.

---

## 2. Color Palette

### 2.1 Base & Foundation
- **Matte Canvas**: `#050505` (Deepest charcoal/black; eliminates battery drain on OLED mobile displays).
- **Secondary Surface**: `#0E0E12` / `#14141A` (Card backings and elevated trays).
- **Specular Highlight**: `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.20)` (Inner bevel borders).

### 2.2 Emergency Accents
- **Emergency Red (Primary)**: `#FF3B30` / `#FF453A` (iOS-style system red for critical alerts, active pulses, and SOS).
- **Red Luminescent Glow**: `rgba(255, 59, 48, 0.45)` with 16px to 32px blur.
- **Amber Warning**: `#FF9F0A` (Urgent non-critical cases and diverting hospitals).
- **Emerald Safe**: `#30D158` (Verified capacity and available beds).

### 2.3 Typography & Neutrals
- **Titanium Primary Text**: `#FFFFFF` to `#F1F5F9` (Headings, primary metrics).
- **Secondary Neutral**: `#94A3B8` (Labels, metadata, timestamps).
- **Muted Caption**: `#64748B` (Micro-copy, tracking badges).

---

## 3. Glassmorphism System

All floating headers, navigation capsules, and modal cards share identical glass parameters:

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Backdrop Filter** | `blur(20px) saturate(180%)` | Standard Apple Liquid Glass spec |
| **Glass Background** | `rgba(14, 14, 18, 0.75)` | Dark-mode frosted translucent base |
| **Inner Bevel Stroke** | `1px solid rgba(255, 255, 255, 0.12)` | Subtle specular edge highlight |
| **Outer Shadow** | `0 12px 32px rgba(0, 0, 0, 0.65)` | Soft ambient elevation |
| **Corner Radius** | `24px` (Cards) / `9999px` (Capsules) | Continuous Apple squircle rounding |

---

## 4. Typography Scale

- **Display Hero**: 36px–48px / Extrabold Italic (Wordmark).
- **Page Titles**: 22px–26px / Bold / Tracking -0.02em.
- **Section Headers**: 15px–17px / Semibold.
- **Body Text**: 13px–14px / Regular / Line height 1.45.
- **System Tags & Status**: 10px–11px / Semibold / Tracking 0.24em (Uppercase).

---

## 5. Responsive Breakpoints & Viewport

- **Mobile First**: Optimized for **390×844px** (standard iPhone viewport) with `viewport-fit=cover` and iOS dynamic safe-area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
- **Tablet**: 768px breakpoint with balanced 2-column card layouts.
- **Desktop / ER Console**: 1024px–1440px wide layout with side-by-side incident feed and interactive routing map.

---

## 6. Accessibility & Human Factors

- **Hold-to-Activate SOS**: 3-second sustained hold with visual ring progress prevents accidental emergency creation while allowing single-handed activation during panic.
- **Audio Feedback**: Voice memo recording indicator with live waveform bars and elapsed timer.
- **High Contrast**: Minimum 7:1 contrast ratio for all vital clinical parameters (BP, SpO2, Heart Rate).
