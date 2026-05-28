## Travel Expense Tracker - UI/UX & Notion Sync Blueprint (v3.0)
### Design Philosophy: "Walking through a Kyoto art gallery at golden hour."

**Document Status**: Updated v3.0 - Japanese Art Effects + Ultra-Fancy Design System + Complete Magic UI Catalog  
**Last Updated**: 2026-05-09  
**Tech Stack**: React 19 + TypeScript 5.8 + Tailwind CSS v4 + Vite 8 + Motion + animejs + shadcn/ui

- - -

<!-- LATEST v2026-05-13 -->
# PART 0: LATEST PROBLEMS & FIXES

> **Date**: 2026-05-13
> **Status**: After user code update

---

## Problem 1: Mobile Chrome Still Flashes on Tab Switch

**Root Cause**: Even after reducing to 150vmax, the combination of:
- WindmillTransition 150vmax conic-gradient
- HyperframeBackground mounts 4 layers into DOM (CSS hides 2 on mobile but React still creates them)
- NoiseTexture full-screen `mix-blend-soft-light` every frame
- Particles 35 dots with physics
- liquid-glass `blur(32px)` with no mobile override
= GPU compositor cannot keep up.

**Latest Fix**:
```tsx
// WindmillTransition.tsx — Reduce further
style={{ width: '100vmax', height: '100vmax', marginLeft: '-50vmax', marginTop: '-50vmax' }}

// HyperframeBackground.tsx — React-conditional layers
const mobile = useMemo(() => isMobile(), []);
const layers = mobile ? [LAYER_BASE, LAYER_SUN] : ALL_LAYERS;

// glass.css — Mobile blur override
@media (max-width: 768px) {
  .liquid-glass-enhanced {
    backdrop-filter: blur(16px) saturate(1.25);
  }
}

// styles.css — content-visibility
@media (max-width: 768px) {
  .glass-card { content-visibility: auto; contain-intrinsic-size: 0 80px; }
}
```

**Alternative**: Replace WindmillTransition with React 19 `<ViewTransition>` (0 KB bundle):
```tsx
import { ViewTransition, startTransition } from 'react';
startTransition(() => setTab(next));
<ViewTransition name="tab-content"><TabContent /></ViewTransition>
```

---

## Problem 2: Camera/Gallery 2nd Attempt Fails

**Root Cause**: `inputKey` increments AFTER `handleImage()` in `finally` block. If user cancels picker, onChange never fires → inputKey never changes → same stale `<input>` reused.

**Latest Fix**: Move `setInputKey()` to BEFORE `.click()`, remove RAF:
```tsx
const triggerCamera = useCallback(() => {
  setMode('scan');
  setInputKey((k) => k + 1);  // ← Before .click()
  if (busy !== 'ocr') {
    Promise.resolve().then(() => cameraRef.current?.click());
  }
}, [busy]);
```

---

## Problem 3: Unused Imports in Dashboard.tsx

**Root Cause**: `AnimatedCircularProgressBar` and `BorderBeam` imported but never used.

**Fix**: Remove the two import lines.

---

## Resources

### pbakaus/impeccable (was "phakerz" — typo)
- GitHub: https://github.com/pbakaus/impeccable (27.8k stars)
- AI coding skill with 23 design commands
- Install: Copy `dist/` folder to project root
- Commands: `/impeccable animate`, `/impeccable delight`, `/impeccable overdrive`

### transitions.dev
- URL: https://transitions.dev
- 12 copy-pasteable CSS transitions

### React 19 `<ViewTransition>`
- Built into React 19, 0 KB bundle
- Replaces WindmillTransition for tab switching
- Better performance than custom animation

---
<!-- END LATEST v2026-05-13 -->

# PART 1: DESIGN PHILOSOPHY & THEME
# PART 1: DESIGN PHILOSOPHY & THEME

## 1.1 Core Aesthetic
- **Japanese Inspired**: Refined minimalism, cream backgrounds, red accents, serif typography, generous whitespace
- **Design Philosophy**: "Walking through a Kyoto art gallery at golden hour." Every pixel tells a story. Every interaction feels like touching handmade washi paper.
- **Three Pillars**: Elegance (serif headings, careful spacing), Clarity (clear hierarchy, no visual clutter), Warmth (warm tones, organic animations)
- **Wabi-Sabi**: Embrace imperfection — subtle textures, organic edges, washi paper feel

## 1.2 Color Palette — v2 (Updated from #d94132 references)

### Base Colors
| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| Cream-100 | `#FBF7F1` | 251,247,241 | Lightest sections, card interiors |
| Cream-200 | `#F5EAD8` | 245,234,216 | Primary background (was #fef7ed) |
| Cream-300 | `#EAD4B6` | 234,212,182 | Slightly deeper, borders |
| Cream-400 | `#D4A574` | 212,165,116 | Accent borders, warm highlights |
| Cream-500 | `#8B7355` | 139,115,85 | Text secondary, muted elements |

### Accent Colors — Japanese Traditional
| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| Akane (茜) | `#D94132` | 217,65,50 | Primary accent (was #d94132) — intense vermillion-red |
| Akane-400 | `#E86A5C` | 232,106,92 | Hover states |
| Akane-300 | `#F0938A` | 240,147,138 | Light accent |
| Akane-200 | `#F5BDB8` | 245,189,184 | Subtle backgrounds |
| Akane-100 | `#FAE5E3` | 250,229,227 | Very light tint |

| Token | Hex | RGB | Japanese Name | Usage |
|-------|-----|-----|---------------|-------|
| Kincha (金茶) | `#C18A26` | 193,138,38 | Gold/ochre | Primary gold accent |
| Sakura (桜) | `#F0B8C8` | 240,184,200 | Cherry blossom | Secondary pink |
| Matcha (抹茶) | `#7A9A6A` | 122,154,106 | Green | Success states |
| Sora (空) | `#4A7AB5` | 74,122,181 | Sky blue | Info states |

### Ink Scale (Text Colors)
| Token | Hex | Usage |
|-------|-----|-------|
| Sumi (墨) | `#1A1A1A` | Primary headings |
| Charcoal | `#2D2926` | Primary text |
| Warm-700 | `#4A4239` | Secondary text |
| Warm-500 | `#6B6259` | Tertiary text |
| Warm-400 | `#9A8E83` | Placeholder, disabled |
| Warm-300 | `#B5ADA3` | Borders, dividers |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Success | `#5A8F6E` | Positive — savings, within budget, synced |
| Warning | `#C4854A` | Caution — approaching limit, partial sync |
| Error | `#B85450` | Negative — over budget, sync failed, errors |
| Info | `#5A7A8F` | Informational — tips, notices |

### Neutral Scale
| Token | Hex | Usage |
|-------|-----|-------|
| Neutral-900 | `#0C0A09` | Deepest |
| Neutral-800 | `#1C1917` | Dark text |
| Neutral-700 | `#292524` | Body text |
| Neutral-600 | `#57534E` | Muted text |
| Neutral-500 | `#A8A29E` | Borders |
| Neutral-400 | `#D6D3D1` | Light borders |
| Neutral-300 | `#E7E5E4` | Subtle bg |
| Neutral-200 | `#F5F5F4` | Light bg |
| Neutral-100 | `#FAFAF9` | Lightest |
| Neutral-50 | `#FAFAF9` | Surface |

## 1.3 Shadows (Japanese-Inspired Depth)

| Token | Value | Usage |
|-------|-------|-------|
| shadow-warm-sm | `0 1px 2px rgba(99,63,30,0.04)` | Subtle inset |
| shadow-warm-md | `0 4px 12px rgba(99,63,30,0.08)` | Cards, dropdowns |
| shadow-warm-lg | `0 8px 30px rgba(99,63,30,0.12)` | Modals, floating |
| shadow-warm-xl | `0 20px 60px rgba(99,63,30,0.16)` | Hero cards |
| shadow-cream | `0 4px 16px rgba(234,212,182,0.20)` | Glass effect |
| shadow-inner-warm | `inset 0 2px 4px rgba(99,63,30,0.04)` | Pressed states |

## 1.4 Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| radius-sm | 8px | Tags, badges |
| radius-md | 12px | Buttons, inputs |
| radius-lg | 16px | Cards |
| radius-xl | 20px | Featured cards |
| radius-2xl | 28px | Hero elements |
| radius-full | 999px | Circles, FAB |

## 1.5 Spacing Scale (4px base)
```
4px (xs) → 8px (sm) → 12px → 16px (md) → 20px → 24px (lg) → 32px (xl) → 48px (2xl) → 64px (3xl)
```

---

# PART 2: TYPOGRAPHY

## 2.1 Font Stack
```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

| Role | Font | Weights | Usage |
|------|------|---------|-------|
| Display | **Noto Serif JP** | 600, 700 | Headings, hero text, tab titles, serif headings |
| Body | **Noto Sans JP** | 400, 500, 700 | Body text, labels, UI elements |
| Mono | **JetBrains Mono** | 400, 500, 600, 700 | Numbers, amounts, dates, tabular-nums |

## 2.2 Type Scale

| Token | Size | Line Height | Weight | Font |
|-------|------|-------------|--------|------|
| display | 32px | 1.2 | 600 | Serif JP |
| h1 | 24px | 1.3 | 600 | Serif JP |
| h2 | 20px | 1.4 | 600 | Serif JP |
| h3 | 16px | 1.4 | 600 | Sans JP |
| body | 16px | 1.6 | 400 | Sans JP |
| body-sm | 14px | 1.5 | 400 | Sans JP |
| caption | 12px | 1.4 | 500 | Sans JP |
| amount-lg | 36px | 1.1 | 600 | JetBrains Mono |
| amount-md | 24px | 1.2 | 600 | JetBrains Mono |
| amount-sm | 18px | 1.2 | 600 | JetBrains Mono |
| amount-xs | 14px | 1.2 | 500 | JetBrains Mono |
| stat | 28px | 1.1 | 700 | JetBrains Mono |

---

# PART 3: LAYOUT ARCHITECTURE

## 3.1 Page Structure
```
┌──────────────────────────────────┐
│  Header (sticky, 56px)           │  ← Shell.tsx: Top bar with title, back, status
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │   Scrollable Content       │  │  ← Main tab content (overflow-y: auto)
│  │   (padded 16-20px)         │  │
│  │                            │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Floating Action Button    │  │  ← FAB (optional, tab-specific)
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Bottom Tab Navigation     │  │  ← Zen Dock (fixed bottom, 72px)
│  │  (Zen Dock v3)             │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

## 3.2 Responsive Behavior
- Mobile-first design (375px - 428px viewport)
- Content max-width: 100% with 16-20px horizontal padding
- All cards full-width with internal padding
- Touch targets minimum 44x44px
- Bottom dock: fixed, always visible, safe-area-inset-bottom

## 3.3 Grid System
- Single column default
- Two-column for quick stats (grid-cols-2, gap-12px)
- Five-column for weather forecast (grid-cols-5, gap-8px)
- Horizontal scroll for day selector (overflow-x: auto)

---

# PART 4: COMPONENT PRIMITIVES

## 4.1 Glass Card v2 (Primary Card)

```css
.glass-card {
  background: rgba(255, 253, 248, 0.72);
  backdrop-filter: blur(20px) saturate(1.15);
  -webkit-backdrop-filter: blur(20px) saturate(1.15);
  border: 1px solid rgba(255, 253, 248, 0.40);
  border-radius: 20px;
  padding: 20px;
  box-shadow:
    0 4px 16px rgba(99, 63, 30, 0.06),
    0 12px 32px rgba(99, 63, 30, 0.08),
    0 24px 48px rgba(234, 212, 182, 0.04);
  position: relative;
  overflow: hidden;
}

/* Glass shimmer highlight — top edge light reflection */
.glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8) 20%, rgba(255,255,255,0.4) 80%, transparent);
}

/* Subtle warm gradient — bottom edge glow */
.glass-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(180deg, transparent 0%, rgba(234,212,182,0.03) 100%);
  pointer-events: none;
  border-radius: 0 0 20px 20px;
}
```

## 4.2 Emoji Circle

```css
.emoji-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 24px;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.08);
}
```

## 4.3 Action Button (56px circular)

```css
.action-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 24px;
  background: linear-gradient(135deg, #F0938A, #D94132);
  color: white;
  box-shadow: 0 4px 16px rgba(217, 65, 50, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.action-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 6px 24px rgba(217, 65, 50, 0.45);
}
.action-btn:active {
  transform: scale(0.94);
}
```

## 4.4 Section Header

```css
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-title {
  font-family: 'Noto Serif JP', serif;
  font-size: 16px;
  font-weight: 600;
  color: #1A1A1A;
}
.section-action {
  font-family: 'Noto Sans JP', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #D94132;
}
```

## 4.5 Status Badge

```css
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Noto Sans JP', sans-serif;
}
.status-badge.synced {
  background: rgba(90, 143, 110, 0.10);
  color: #5A8F6E;
}
.status-badge.syncing {
  background: rgba(196, 133, 74, 0.10);
  color: #C4854A;
}
.status-badge.error {
  background: rgba(184, 84, 80, 0.10);
  color: #B85450;
}
```

## 4.6 Currency Display

```css
.currency-display {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.currency-display.amount-lg {
  font-size: 36px;
  line-height: 1.1;
}
.currency-display.amount-md {
  font-size: 24px;
  line-height: 1.2;
}
.currency-display.amount-sm {
  font-size: 18px;
}
.currency-display.negative {
  color: #B85450;
}
.currency-display.positive {
  color: #5A8F6E;
}
```

---

# PART 5: INTERACTIVE ELEMENTS

## 5.1 Button States

### Ghost Button
```css
.btn-ghost {
  padding: 8px 16px;
  border-radius: 12px;
  background: transparent;
  color: #2D2926;
  font-family: 'Noto Sans JP', sans-serif;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s ease;
}
.btn-ghost:hover { background: rgba(99,63,30,0.04); }
.btn-ghost:active { background: rgba(99,63,30,0.08); }
```

### Primary Button
```css
.btn-primary {
  padding: 12px 24px;
  border-radius: 14px;
  background: linear-gradient(135deg, #E86A5C, #D94132);
  color: white;
  font-family: 'Noto Sans JP', sans-serif;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(217, 65, 50, 0.30);
  transition: all 0.2s ease;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(217, 65, 50, 0.40);
}
.btn-primary:active {
  transform: scale(0.97);
}
```

### Icon Button
```css
.btn-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(255,253,248,0.60);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(232,220,200,0.30);
  color: #4A4239;
  transition: all 0.15s ease;
}
.btn-icon:hover { transform: scale(1.08); background: rgba(255,253,248,0.80); }
.btn-icon:active { transform: scale(0.92); }
```

## 5.2 Input v2

```css
.input-v2 {
  background: #FFFDFA;
  border: 1.5px solid #E8DCC8;
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 16px;
  color: #2D2926;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.input-v2::placeholder { color: #B5ADA3; }
.input-v2:focus {
  outline: none;
  border-color: #E86A5C;
  box-shadow: 0 0 0 3px rgba(232,106,92,0.15);
}
```

## 5.3 Receipt Card

```css
.receipt-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(255,253,248,0.65);
  border: 1px solid rgba(232,220,200,0.50);
  border-radius: 20px;
  transition: all 0.2s var(--ease-wa);
  position: relative;
  overflow: hidden;
}
.receipt-card:hover {
  background: rgba(255,253,248,0.85);
  transform: translateX(4px);
  box-shadow: var(--shadow-warm-md);
}
.receipt-card:active { transform: scale(0.98); }

.receipt-emoji {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 24px;
  flex-shrink: 0;
  /* Per-category gradient backgrounds */
}

.receipt-store {
  font-family: 'Noto Serif JP', serif;
  font-size: 16px;
  font-weight: 600;
  color: #2D2926;
}

.receipt-amount {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  font-weight: 600;
  color: #2D2926;
  margin-left: auto;
}
```

### Receipt Category Emoji Circles

| Category | Emoji | Gradient Background |
|----------|-------|-------------------|
| flight | ✈️ | linear-gradient(135deg, #B0CCED, #4A6FA5) |
| transport | 🚆 | linear-gradient(135deg, #C8E2B4, #639B40) |
| food | 🍱 | linear-gradient(135deg, #F9B8AE, #D94132) |
| shopping | 🛍️ | linear-gradient(135deg, #FFD4DE, #E880AA) |
| lodging | 🏨 | linear-gradient(135deg, #E8CDA3, #B07D4F) |
| ticket | 🎫 | linear-gradient(135deg, #C4A5E0, #9B6EC2) |
| localtour | 🗺️ | linear-gradient(135deg, #FDDDD8, #D94132) |
| medicine | 💊 | linear-gradient(135deg, #D8E4F5, #4A6FA5) |
| other | 📦 | linear-gradient(135deg, #C4B8AD, #9A8E83) |

## 5.4 Zen Bottom Dock v3

Replaces current BottomDock with a macOS-style animated dock:

```tsx
// Uses @magicui/dock or custom implementation
<nav className="zen-dock">
  {tabs.map((tab) => (
    <button key={tab.id} className={`dock-item ${active === tab.id ? 'active' : ''}`}>
      <motion.div layoutId={active === tab.id ? 'dock-indicator' : undefined}>
        {active === tab.id ? <tab.icon.filled /> : <tab.icon.outline />}
      </motion.div>
      <span className="dock-label">{tab.label}</span>
      {active === tab.id && <motion.div className="dock-dot" layoutId="dock-dot" />}
    </button>
  ))}
</nav>
```

```css
.zen-dock {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  background: rgba(255,253,248,0.72);
  backdrop-filter: blur(20px) saturate(1.15);
  border: 1px solid rgba(255,253,248,0.40);
  border-radius: 999px;
  box-shadow: var(--shadow-warm-lg);
  z-index: 100;
}
.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 16px;
  transition: all 0.25s var(--ease-wa);
  color: #9A8E83;
}
.dock-item.active {
  color: #D94132;
}
.dock-item:hover:not(.active) {
  color: #6B6259;
  background: rgba(92,82,71,0.04);
}
.dock-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #D94132;
}
```

## 5.5 Budget Ring

```tsx
// Animated SVG ring with animejs or react-spring
<svg viewBox="0 0 200 200" className="budget-ring">
  <defs>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#E86A5C" />
      <stop offset="50%" stopColor="#FFB3C5" />
      <stop offset="100%" stopColor="#82B55E" />
    </linearGradient>
  </defs>
  {/* Background track */}
  <circle cx="100" cy="100" r="80" fill="none" stroke="#E8DCC8" strokeWidth="12" opacity="0.3" />
  {/* Animated progress arc */}
  <animated.circle
    cx="100" cy="100" r="80"
    fill="none"
    stroke="url(#ringGrad)"
    strokeWidth="12"
    strokeLinecap="round"
    strokeDasharray={circumference}
    strokeDashoffset={springProps.offset}
  />
</svg>
```

## 5.6 Toast v2

```css
.toast-v2 {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  padding: 14px 24px;
  border-radius: 999px;
  background: rgba(255,253,248,0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255,253,248,0.50);
  box-shadow: var(--shadow-warm-lg);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: toast-in 0.4s var(--ease-hana);
}
.toast-v2.success { border-left: 3px solid #5A8F6E; }
.toast-v2.error   { border-left: 3px solid #B85450; }
.toast-v2.warning { border-left: 3px solid #C4854A; }

@keyframes toast-in {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to   { transform: translateX(-50%) translateY(0); opacity: 1; }
}
```

---

# PART 6: ANIMATION SYSTEM

## 6.1 Philosophy

Every animation tells a story. Japanese-inspired: gentle, purposeful, never jarring. Animations should feel like:
- Opening a shoji screen (gentle slide)
- Ink settling on washi paper (gradual reveal)
- A cherry blossom petal falling (natural, organic)

## 6.2 Easing Curves

| Name | Curve | Usage | Japanese Concept |
|------|-------|-------|-----------------|
| ease-ma | cubic-bezier(0.25,0.1,0.25,1) | Page transitions, modals | Ma — space between |
| ease-wa | cubic-bezier(0,0,0.2,1) | Card hovers, button states | Wa — harmony |
| ease-kaze | cubic-bezier(0.32,0.72,0.56,1) | Dropdowns, toasts | Kaze — wind |
| ease-hana | cubic-bezier(0.68,-0.15,0.265,1.35) | Bouncy entrances | Hana — flower |
| ease-sumi | cubic-bezier(0.4,0,0.6,1) | Number reveals, loading | Sumi — ink |
| ease-ka | cubic-bezier(0.16,1,0.3,1) | Toggles, instant feedback | Ka — fire |
| ease-ki | cubic-bezier(0.34,1.56,0.64,1) | List item entrances | Ki — tree |

## 6.3 Duration Standards

| Duration | ms | Usage |
|----------|-----|-------|
| micro | 100 | Color/border transitions |
| fast | 150 | Hover, focus states |
| normal | 250 | Buttons, tabs, small transitions |
| deliberate | 400 | Page transitions, modals |
| slow | 600 | Premium reveals, hero animations |
| cinematic | 900 | Dramatic entrances |

## 6.4 Micro-Interactions Library

### Button Press
```css
button:active { transform: scale(0.96); transition: transform 0.1s var(--ease-ka); }
button { transition: transform 0.2s var(--ease-ka), box-shadow 0.2s var(--ease-wa); }
```

### Card Hover
```css
.card:hover {
  transform: translateY(-2px) scale(1.01);
  box-shadow: var(--shadow-warm-lg);
  transition: all 0.25s var(--ease-wa);
}
```

### Receipt Add (Stagger)
```tsx
// Using motion (already installed):
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }
  }),
};
// Each receipt card gets: <motion.div custom={index} variants={variants} />
```

### Number Count-Up
```tsx
// Using react-spring:
const { number } = useSpring({
  from: { number: 0 },
  number: targetValue,
  config: { tension: 120, friction: 20 },
});
<animated.span>{number.to(n => Math.round(n).toLocaleString())}</animated.span>
```

### Page Transition — Shoji Slide
```tsx
// Using motion + AnimatePresence:
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, x: direction * 30 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: direction * -30 }}
    transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
  >
    {tabContent}
  </motion.div>
</AnimatePresence>
```

### Ink Wash Reveal
```css
@keyframes ink-reveal {
  0% { clip-path: inset(0 100% 0 0); opacity: 0; filter: blur(4px); }
  30% { opacity: 1; }
  100% { clip-path: inset(0 0 0 0); opacity: 1; filter: blur(0); }
}
.ink-reveal { animation: ink-reveal 0.8s var(--ease-sumi) both; }
```

### Pull-to-Refresh (Ink Ripple)
```css
@keyframes ink-ripple {
  0% { transform: scale(0); opacity: 0.6; }
  100% { transform: scale(4); opacity: 0; }
}
.ptr-indicator::after {
  content: '';
  position: absolute;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(199,92,58,0.2), transparent);
  animation: ink-ripple 1.2s var(--ease-sumi) infinite;
}
```

### Success Checkmark Draw
```tsx
// Using animejs:
const scope = createScope({ root: checkRef.current }).add(() => {
  createTimeline()
    .add('.check-path', {
      strokeDashoffset: [anime.setDashoffset, 0],
      duration: 600,
      ease: 'cubicBezier(0.25, 0.1, 0.25, 1)',
    });
});
```

### Sakura Petal Background
```tsx
// Full implementation in SakuraBackground.tsx
// Canvas-based, 25 petals, 30fps cap
// Natural sinusoidal sway, warm-tinted petals
// respects prefers-reduced-motion
```

### Header Blur on Scroll
```tsx
// Using motion useScroll:
const { scrollY } = useScroll();
const headerBg = useTransform(scrollY, [0, 100], ['rgba(255,253,248,0)', 'rgba(255,253,248,0.85)']);
const headerBlur = useTransform(scrollY, [0, 100], ['blur(0px)', 'blur(12px)']);
```

---

# PART 7: SCREEN-BY-SCREEN DESIGN

## 7.1 Dashboard Tab (Most Important Screen)

### Layout (Top to Bottom)
```
+------------------------------------------+
| [back] [Title: 名古屋 2026]     [status] |  <- Top bar, 48px
+------------------------------------------+
|                                          |
|  Trip Hero Section                       |  <- 32px padding top
|  +------------------------------------+  |
|  | 名古屋 2026         Mar 28 - Apr 3 |  |  <- Serif JP, 28px
|  |                                    |  |
|  |           [Budget Ring SVG]        |  |  <- Center, 200px
|  |              ¥45,230               |  |  <- Mono, 36px, bold
|  |           of ¥101,800              |  |  <- Mono, 16px, muted
|  |            [||||||....] 44%        |  |  <- Progress bar
|  +------------------------------------+  |
|                                          |
|  Today's Itinerary (GlassCard)           |  <- 24px gap
|  +------------------------------------+  |
|  | :round_pushpin: Nagoya Station     9:00 AM      |  |
|  | :ramen: Lunch at Yabaton   12:30 PM     |  |
|  +------------------------------------+  |
|                                          |
|  Recent Expenses                         |  <- Section header
|  +------------------------------------+  |
|  | :bento: 矢場とん              ¥3,200   |  |  <- Receipt card
|  | :bullettrain_side: Shinkansen Tokyo    ¥13,200   |  |
|  | :hotel: Hotel Trusty        ¥8,500    |  |
|  +------------------------------------+  |
|                                          |
|  Quick Actions (ActionSheet)             |
|  [:camera: Scan] [:pencil2: Manual] [:bar_chart: Stats]       |
|                                          |
+------------------------------------------+
|        [ Zen Dock Navigation ]           |  <- Fixed bottom
+------------------------------------------+
```

### Design Specs
- Top bar: Cream-200 bg, Serif JP title 20px weight 700
- Hero card: GlassCard v2, 28px radius, LG shadow
- Budget Ring: SVG with gradient (Akane -> Sakura -> Matcha), spring-animated
- Amount: JetBrains Mono 36px weight 700, tabular-nums
- Receipt cards: Receipt card v2 component, stagger animation on load
- Quick actions: ActionSheet with 56px circular buttons, icon + label
- All animations: Stagger fade-in (0.05s per item), ease-ki

## 7.2 Scan Tab

```
+------------------------------------------+
| Scan Receipt                    [close]  |
+------------------------------------------+
|                                          |
|  +------------------------------------+  |
|  |                                    |  |
|  |      [Camera Preview Area]         |  |  <- 70vh height
|  |                                    |  |
|  |      [:camera: Shutter Button]           |  |  <- Bottom center
|  |                                    |  |
|  |                                    |  |
|  +------------------------------------+  |
|                                          |
|  [:framed_picture: Choose Photo]  [:pencil2: Enter Manually] |  <- Bottom buttons
|                                          |
+------------------------------------------+
```

### Design Specs
- Camera area: Full-width, rounded 24px corners
- Shutter button: 72px circle, Akane gradient, white icon, LG shadow
- AI scanning overlay: GlassCard with blur, ShimmerText animation
- Receipt card preview: Slides up from bottom, spring animation
- Manual entry form: Scrollable, Input v2 components

## 7.3 Timeline Tab

```
+------------------------------------------+
| Itinerary                       [sync]   |
+------------------------------------------+
| [Day 1] [Day 2] [Day 3] ...  <- horizontal scroll |
+------------------------------------------+
|                                          |
|  Timeline Rail (Vertical)                |
|  :large_blue_circle:--- 9:00 AM                           |
|  |    Nagoya Station                     |
|  |    :shinto_shrine: Arrival                         |
|  |                                       |
|  :large_blue_circle:--- 10:30 AM                          |
|  |    Atsuta Shrine                      |
|  |    :classical_building: Sightseeing                     |
|  |                                       |
|  :large_blue_circle:--- 12:30 PM                          |
|  |    Yabaton                            |
|  |    :bento: Lunch                           |
|  |                                       |
+------------------------------------------+
```

### Design Specs
- Day selector: Horizontal scroll, pill buttons, active: filled Akane
- Timeline rail: Left border #E8DCC8, dot: Akane-400, 12px circle
- Activity card: GlassCard v2, emoji circle, spring entrance
- Time label: JetBrains Mono 13px, muted color
- Active activity: Slight left highlight bar

## 7.4 History Tab

```
+------------------------------------------+
| History     [:mag: search]  [:gear: filter]     |
+------------------------------------------+
| [:camera: Scan]  <- Quick scan FAB              |
|                                          |
| March 2026                               |  <- Month divider
| +------------------------------------+  |
|  :bento: 矢場とん    ¥3,200   12:30    |  |
|  :bullettrain_side: Shinkansen  ¥13,200  09:15    |  |
|  +------------------------------------+  |
|                                          |
| February 2026                            |
| +------------------------------------+  |
|  :hotel: Hotel Trusty ¥8,500  20:00    |  |
|  +------------------------------------+  |
|                                          |
| [Pull from Notion]  [Push All]          |  <- Bottom actions
+------------------------------------------+
```

### Design Specs
- Search bar: Input v2 with magnifying glass icon
- Category filter: Pill buttons row
- Month divider: Serif JP 14px, muted, with line
- Receipt rows: Receipt card v2, swipe-to-reveal
- FAB: 56px circle, Akane gradient, shadow
- Bottom actions: Ghost buttons with sync icon

## 7.5 Weather Tab

```
+------------------------------------------+
| Weather      [:round_pushpin: Nagoya]         [sync]  |
+------------------------------------------+
|                                          |
|  +------------------------------------+  |
|  |           Current                  |  |
|  |         :partly_sunny: 18°C                    |  |  <- Large emoji + temp
|  |      Partly Cloudy                 |  |
|  |   H:22°  L:14°  :droplet:45%             |  |
|  +------------------------------------+  |
|                                          |
|  5-Day Forecast                          |
|  +----+ +----+ +----+ +----+ +----+   |
|  |Mon | |Tue | |Wed | |Thu | |Fri |   |
|  |:partly_sunny:22° | |:cloud_with_rain:19° | |:sunny:25° | |:partly_sunny:22° | |:sun_behind_rain_cloud:17° |   |
|  +----+ +----+ +----+ +----+ +----+   |
|                                          |
+------------------------------------------+
```

### Design Specs
- Current weather: GlassCard v2, large emoji 64px, temp in Mono 48px
- Forecast cards: 5-column grid, GlassCard SM variant
- Location selector: Dropdown, Serif JP
- Temperature: JetBrains Mono, tabular-nums
- Sync status: Shows last weather update time

## 7.6 Stats Tab

```
+------------------------------------------+
| Statistics                    [settings] |
+------------------------------------------+
|                                          |
|  Spending by Category                    |
|  +------------------------------------+  |
|  |  [Donut Chart / 3D Cards]          |  |  <- Center
|  |                                    |  |
|  |  :bento: Food    ¥45,200   44% ████   |  |
|  |  :bullettrain_side: Trans   ¥32,100   31% ███    |  |
|  |  :hotel: Hotel   ¥18,500   18% ██     |  |
|  |  :ticket: Tix     ¥6,000    6%  █      |  |
|  +------------------------------------+  |
|                                          |
|  Daily Spending Graph                    |
|  +------------------------------------+  |
|  |  [Bar/Line Chart]                  |  |
|  +------------------------------------+  |
|                                          |
|  Top Expenses                            |
|  +------------------------------------+  |
|  |  1. Shinkansen    ¥13,200         |  |
|  |  2. Hotel 3nights ¥25,500         |  |
|  |  3. Kobe Beef     ¥8,900          |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
```

### Design Specs
- Category cards: Aceternity 3DCard or custom with emoji + bar
- Donut chart: SVG with category colors, animated fill
- Daily graph: Recharts or Chart.js with cream theme
- Top expenses: Ranked list with medal emojis (:1st_place_medal::2nd_place_medal::3rd_place_medal:)
- All numbers: JetBrains Mono, tabular-nums

## 7.7 Settings Tab

```
+------------------------------------------+
| Settings                        [reset]  |
+------------------------------------------+
|                                          |
|  Account                                  |
|  +------------------------------------+  |
|  | Credential Broker :link: Connected     |  |
|  | Trip: 名古屋 2026                  |  |
|  | Budget: ¥101,800 = HKD $5,000     |  |
|  +------------------------------------+  |
|                                          |
|  Sync                                     |
|  +------------------------------------+  |
|  | Auto-Sync [ON]                     |  |
|  | Last Sync: 2 min ago               |  |
|  | [Push All]  [Pull Now]             |  |
|  | [Force Push All]                   |  |
|  +------------------------------------+  |
|                                          |
|  People                                   |
|  +------------------------------------+  |
|  | Tony   [x]                         |  |
|  | 欣欣    [x]                         |  |
|  | [+ Add Person]                     |  |
|  +------------------------------------+  |
|                                          |
|  Data                                     |
|  +------------------------------------+  |
|  | [Export CSV]  [Export JSON]        |  |
|  | [Import CSV]  [Import JSON]        |  |
|  | [Clear All Data]                   |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
```

### Design Specs
- Grouped cards: GlassCard v2 with section headers
- Toggles: Custom switch with spring animation
- Status indicators: Colored dots (green=connected)
- Buttons: Full-width inside cards, rounded 14px
- Danger actions: Red text with confirmation dialog

---

# PART 8: BACKGROUND & AMBIENT DESIGN

## 8.1 Layered Background Architecture

```
Layer 5 (z: -1): Sakura Petals (canvas, seasonal, optional)
Layer 4 (z: -2): Light sweep animation (18s alternate)
Layer 3 (z: -3): Subtle dot pattern overlay (0.46 opacity)
Layer 2 (z: -4): Linear gradients for depth
Layer 1 (z: -5): Base cream color (#F5EAD8)
```

## 8.2 Base Background

```css
body {
  background: linear-gradient(
    180deg,
    #fbefd8 0%,      /* Warmer at top */
    #F5EAD8 40%,     /* Primary cream */
    #f0e6d0 100%     /* Slightly deeper at bottom */
  );
  min-height: 100svh;
}
```

## 8.3 Dot Pattern Overlay

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -3;
  pointer-events: none;
  opacity: 0.25;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(99,63,30,0.10) 0 1px, transparent 1px),
    radial-gradient(circle at 76% 46%, rgba(99,63,30,0.08) 0 1px, transparent 1px);
  background-size: 34px 34px, 47px 47px;
}
```

## 8.4 Light Sweep Animation

```css
body::after {
  content: '';
  position: fixed;
  inset: -20% -10%;
  z-index: -4;
  pointer-events: none;
  opacity: 0.20;
  background:
    linear-gradient(115deg, transparent 0 36%, rgba(255,255,255,0.30) 47%, transparent 58%),
    linear-gradient(78deg, transparent 0 58%, rgba(211,154,41,0.10) 68%, transparent 78%);
  animation: light-sweep 18s ease-in-out infinite alternate;
}
@keyframes light-sweep {
  0% { opacity: 0.15; transform: translate(0, 0); }
  100% { opacity: 0.30; transform: translate(20px, 15px); }
}
```

## 8.5 Decorative Elements

### Top-Right Red Circle (Refined)
```css
.decoration-circle {
  position: fixed;
  top: 3%;
  right: 5%;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #E86A5C, #B83528);
  opacity: 0.08;
  z-index: -2;
  pointer-events: none;
  filter: blur(1px);
}
```

### Diagonal Glass Ribbon
```css
.decoration-ribbon {
  position: fixed;
  top: -10%;
  right: -5%;
  width: 200px;
  height: 120%;
  background: linear-gradient(135deg, transparent 0 40%, rgba(24,57,92,0.04) 45%, transparent 50%);
  z-index: -2;
  pointer-events: none;
  transform: rotate(-15deg);
}
```

---

# PART 9: SEASONAL THEMING

## 9.1 Season Definitions

```typescript
// lib/seasonal.ts
export const SEASONS = {
  spring: {
    name: '春',
    nameEn: 'Spring',
    primary: '#F4B8C6',    // Sakura pink
    accent: '#E891A0',
    bgTone: '#FFF8FA',
    glowColor: 'rgba(244,184,198,0.30)',
    particle: 'sakura',    // Falling cherry petals
    icon: ':cherry_blossom:',
  },
  summer: {
    name: '夏',
    nameEn: 'Summer',
    primary: '#7A9E7E',    // Matcha green
    accent: '#A8C4A6',
    bgTone: '#F8FBF8',
    glowColor: 'rgba(122,158,126,0.25)',
    particle: 'firefly',   // Glowing firefly dots
    icon: ':leaves:',
  },
  autumn: {
    name: '秋',
    nameEn: 'Autumn',
    primary: '#D4532C',    // Deep orange-red
    accent: '#C4956A',     // Kuchiba
    bgTone: '#FDF8F5',
    glowColor: 'rgba(212,83,44,0.20)',
    particle: 'leaf',      // Falling maple leaves
    icon: ':maple_leaf:',
  },
  winter: {
    name: '冬',
    nameEn: 'Winter',
    primary: '#4A6FA5',    // Ruri blue
    accent: '#B8C4CE',
    bgTone: '#F5F7FA',
    glowColor: 'rgba(74,111,165,0.25)',
    particle: 'snow',      // Falling snowflakes
    icon: ':snowflake:',
  },
} as const;

export type Season = keyof typeof SEASONS;

export function getCurrentSeason(): Season {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export function getSeasonalColors(season: Season = getCurrentSeason()) {
  return SEASONS[season];
}
```

## 9.2 Seasonal Accent Application

| Season | App Accent Color | Particle Effect | Glow Color |
|--------|-----------------|-----------------|------------|
| Spring | Sakura-300 | Falling petals | Pink glow |
| Summer | Matcha-300 | Glowing fireflies | Green glow |
| Autumn | Kuchiba-400 | Falling leaves | Orange glow |
| Winter | Ruri-300 | Falling snowflakes | Blue glow |



---

# PART 10: COMPONENT LIBRARY INTEGRATION (Complete Rewrite)

## 10.1 Core Animation Libraries

| Library | Purpose | Install | Status |
|---------|---------|---------|--------|
| shadcn/ui | Base primitives (Button, Dialog, Input, Card) | `npx shadcn@latest init` | P0 |
| animejs | Complex animation sequences | `npm install animejs` | P0 |
| @react-spring/web | Physics-based springs | `npm install @react-spring/web` | P0 |
| motion | Layout animations, gestures | Already installed | P0 |
| gsap + ScrollTrigger | Professional timelines, scroll triggers | `npm install gsap @gsap/react` | P1 |

## 10.2 Complete Magic UI Component Catalog (75+ Components)

> **Source**: magicui_full_catalog.md | **Registry**: https://magicui.design/r

---

### Category: Buttons (6 components)

| # | Component | Install Command | Screen | Priority | Status |
|---|-----------|-----------------|--------|----------|--------|
| 1 | `ripple-button` | `npx shadcn@latest add @magicui/ripple-button` | Scan (shutter) | P0 | **INSTALLED** |
| 2 | `shimmer-button` | `npx shadcn@latest add @magicui/shimmer-button` | Dashboard (CTA) | P0 | Pending |
| 3 | `animated-subscribe-button` | `npx shadcn@latest add @magicui/animated-subscribe-button` | Settings (sync toggle) | P2 | Pending |
| 4 | `magnet-button` | `npx shadcn@latest add @magicui/magnet-button` | All (interactive CTAs) | P1 | Pending |
| 5 | `interactive-hover-button` | `npx shadcn@latest add @magicui/interactive-hover-button` | History (quick actions) | P2 | Pending |
| 6 | `star-button` | `npx shadcn@latest add @magicui/star-button` | Weather (favorites) | P2 | Pending |

### Category: Text Animations (19 components)

| # | Component | Install Command | Screen | Priority | Status |
|---|-----------|-----------------|--------|----------|--------|
| 7 | `blur-fade` | `npx shadcn@latest add @magicui/blur-fade` | All tabs (page entrance) | P0 | **INSTALLED** |
| 8 | `number-ticker` | `npx shadcn@latest add @magicui/number-ticker` | Dashboard (budget amount) | P0 | **INSTALLED** |
| 9 | `animated-shiny-text` | `npx shadcn@latest add @magicui/animated-shiny-text` | Scan (AI processing label) | P1 | Pending |
| 10 | `animated-gradient-text` | `npx shadcn@latest add @magicui/animated-gradient-text` | Dashboard (hero title) | P1 | Pending |
| 11 | `shimmer-text` | `npx shadcn@latest add @magicui/shimmer-text` | Scan (AI "Scanning...") | P0 | Pending |
| 12 | `text-animate` | `npx shadcn@latest add @magicui/text-animate` | All (heading entrances) | P1 | Pending |
| 13 | `loop-text` | `npx shadcn@latest add @magicui/loop-text` | Stats (category labels) | P2 | Pending |
| 14 | `spinning-text` | `npx shadcn@latest add @magicui/spinning-text` | Dashboard (loading spinner) | P2 | Pending |
| 15 | `scroll-progress` | `npx shadcn@latest add @magicui/scroll-progress` | All (scroll indicator) | P1 | Pending |
| 16 | `code-comparison` | `npx shadcn@latest add @magicui/code-comparison` | Settings (data export view) | P3 | Pending |
| 17 | `morphing-text` | `npx shadcn@latest add @magicui/morphing-text` | Dashboard (trip name) | P2 | Pending |
| 18 | `text-rotate` | `npx shadcn@latest add @magicui/text-rotate` | Stats (animated headers) | P2 | Pending |
| 19 | `text-reveal` | `npx shadcn@latest add @magicui/text-reveal` | Dashboard (total amount reveal) | P1 | Pending |
| 20 | `text-reveal-by-word` | `npx shadcn@latest add @magicui/text-reveal-by-word` | Dashboard (hero description) | P2 | Pending |
| 21 | `number-ticker` | `npx shadcn@latest add @magicui/number-ticker` | Stats (spending figures) | P0 | **INSTALLED** |
| 22 | `count-up` | `npx shadcn@latest add @magicui/count-up` | Dashboard (animated stats) | P1 | Pending |
| 23 | `slot-machine-text` | `npx shadcn@latest add @magicui/slot-machine-text` | Stats (category numbers) | P3 | Pending |
| 24 | `spinning-text-circle` | `npx shadcn@latest add @magicui/spinning-text-circle` | Loading screen | P3 | Pending |
| 25 | `typing-animation` | `npx shadcn@latest add @magicui/typing-animation` | Timeline (activity descriptions) | P2 | Pending |

### Category: Background Effects (20 components)

| # | Component | Install Command | Screen | Priority | Status |
|---|-----------|-----------------|--------|----------|--------|
| 26 | `particles` | `npx shadcn@latest add @magicui/particles` | All (ambient background) | P1 | Pending |
| 27 | `noise` / `noise-texture` | `npx shadcn@latest add @magicui/noise` | All (washi paper texture) | P1 | **INSTALLED** |
| 28 | `dot-pattern` | `npx shadcn@latest add @magicui/dot-pattern` | All (subtle dot overlay) | P2 | Pending |
| 29 | `grid-pattern` | `npx shadcn@latest add @magicui/grid-pattern` | Settings (options grid bg) | P2 | Pending |
| 30 | `animated-beam` | `npx shadcn@latest add @magicui/animated-beam` | Dashboard (data flow) | P2 | Pending |
| 31 | `animated-beam-multiple` | `npx shadcn@latest add @magicui/animated-beam-multiple` | Stats (multi-category flow) | P3 | Pending |
| 32 | `border-beam` | `npx shadcn@latest add @magicui/border-beam` | Dashboard (featured card) | P0 | **INSTALLED** |
| 33 | `background-beams` | `npx shadcn@latest add @magicui/background-beams` | Dashboard (hero background) | P1 | Pending |
| 34 | `background-boxes` | `npx shadcn@latest add @magicui/background-boxes` | Stats (category grid bg) | P3 | Pending |
| 35 | `background-lines` | `npx shadcn@latest add @magicui/background-lines` | Timeline (vertical lines) | P2 | Pending |
| 36 | `background-gradient` | `npx shadcn@latest add @magicui/background-gradient` | All (cream gradient bg) | P1 | Pending |
| 37 | `aurora-text` | `npx shadcn@latest add @magicui/aurora-text` | Dashboard (trip title) | P2 | Pending |
| 38 | `aurora-background` | `npx shadcn@latest add @magicui/aurora-background` | Settings (ambient bg) | P2 | Pending |
| 39 | `flickering-grid` | `npx shadcn@latest add @magicui/flickering-grid` | Stats (chart background) | P3 | Pending |
| 40 | `neon-gradient-card` | `npx shadcn@latest add @magicui/neon-gradient-card` | Dashboard (hero card) | P2 | Pending |
| 41 | `waves-background` | `npx shadcn@latest add @magicui/waves-background` | Weather (ocean effect) | P2 | Pending |
| 42 | `interactive-grid-pattern` | `npx shadcn@latest add @magicui/interactive-grid-pattern` | Stats (interactive grid) | P3 | Pending |
| 43 | `particles` | `npx shadcn@latest add @magicui/particles` | All (confetti-like bg) | P1 | Pending |
| 44 | `sparkles-text` | `npx shadcn@latest add @magicui/sparkles-text` | Dashboard (budget total) | P1 | Pending |
| 45 | `meteors` | `npx shadcn@latest add @magicui/meteors` | Weather (night sky) | P2 | Pending |

### Category: Card Effects (18 components)

| # | Component | Install Command | Screen | Priority | Status |
|---|-----------|-----------------|--------|----------|--------|
| 46 | `magic-card` | `npx shadcn@latest add @magicui/magic-card` | All (receipt cards) | P0 | **INSTALLED** |
| 47 | `card-spotlight` | `npx shadcn@latest add @magicui/card-spotlight` | Settings (option cards) | P0 | **INSTALLED** |
| 48 | `3d-card` | `npx shadcn@latest add @magicui/3d-card` | Stats (category cards) | P1 | Pending |
| 49 | `tilt-card` | `npx shadcn@latest add @magicui/tilt-card` | Dashboard (hero card) | P1 | Pending |
| 50 | `hover-border-gradient-card` | `npx shadcn@latest add @magicui/hover-border-gradient-card` | Stats (category cards) | P2 | Pending |
| 51 | `flip-card` | `npx shadcn@latest add @magicui/flip-card` | Stats (category detail) | P2 | Pending |
| 52 | `glowing-card` | `npx shadcn@latest add @magicui/glowing-card` | Dashboard (featured) | P2 | Pending |
| 53 | `card-3d` | `npx shadcn@latest add @magicui/card-3d` | Stats (spending cards) | P2 | Pending |
| 54 | `direction-aware-hover` | `npx shadcn@latest add @magicui/direction-aware-hover` | History (receipt hover) | P2 | Pending |
| 55 | `tracing-beam` | `npx shadcn@latest add @magicui/tracing-beam` | Timeline (activity trace) | P1 | Pending |
| 56 | `expandable-card` | `npx shadcn@latest add @magicui/expandable-card` | History (receipt detail) | P1 | Pending |
| 57 | `focus-cards` | `npx shadcn@latest add @magicui/focus-cards` | Dashboard (quick stats) | P2 | Pending |
| 58 | `lens` | `npx shadcn@latest add @magicui/lens` | Scan (receipt zoom) | P2 | Pending |
| 59 | `magnified-dock` | `npx shadcn@latest add @magicui/magnified-dock` | Dashboard (quick actions) | P2 | Pending |
| 60 | `parallax-scroll` | `npx shadcn@latest add @magicui/parallax-scroll` | Timeline (scroll effect) | P3 | Pending |
| 61 | `scroll-reveal-card` | `npx shadcn@latest add @magicui/scroll-reveal-card` | History (receipt entrance) | P1 | Pending |
| 62 | `shiny-card` | `npx shadcn@latest add @magicui/shiny-card` | Dashboard (hero card) | P1 | Pending |
| 63 | `spotlight-card` | `npx shadcn@latest add @magicui/spotlight-card` | Settings (mouse spotlight) | P1 | Pending |

### Category: Special Effects (6 components)

| # | Component | Install Command | Screen | Priority | Status |
|---|-----------|-----------------|--------|----------|--------|
| 64 | `canvas-reveal-effect` | `npx shadcn@latest add @magicui/canvas-reveal-effect` | Dashboard (budget reveal) | P0 | **INSTALLED** |
| 65 | `confetti` | `npx shadcn@latest add @magicui/confetti` | Scan (success celebration) | P1 | Pending |
| 66 | `file-upload` | `npx shadcn@latest add @magicui/file-upload` | Scan (photo upload) | P0 | **INSTALLED** |
| 67 | `particles` | `npx shadcn@latest add @magicui/particles` | All (ambient particles) | P1 | Pending |
| 68 | `safari-browser` | `npx shadcn@latest add @magicui/safari-browser` | Settings (preview) | P3 | Pending |
| 69 | `terminal` | `npx shadcn@latest add @magicui/terminal` | Settings (debug console) | P3 | Pending |

### Category: Navigation & Layout (3 components)

| # | Component | Install Command | Screen | Priority | Status |
|---|-----------|-----------------|--------|----------|--------|
| 70 | `floating-dock` | `npx shadcn@latest add @magicui/floating-dock` | All (bottom nav) | P0 | **INSTALLED** |
| 71 | `bento-grid` | `npx shadcn@latest add @magicui/bento-grid` | Dashboard (widget grid) | P1 | Pending |
| 72 | `timeline` | `npx shadcn@latest add @magicui/timeline` | Timeline (trip itinerary) | P0 | **INSTALLED** |

### Category: Progress & Loading (4 components)

| # | Component | Install Command | Screen | Priority | Status |
|---|-----------|-----------------|--------|----------|--------|
| 73 | `progressive-blur` | `npx shadcn@latest add @magicui/progressive-blur` | All (scroll blur) | P1 | **INSTALLED** |
| 74 | `spinner` / `loading-spinner` | `npx shadcn@latest add @magicui/spinner` | All (loading states) | P1 | Pending |
| 75 | `skeleton` | `npx shadcn@latest add @magicui/skeleton` | All (loading placeholder) | P1 | Pending |
| 76 | `multi-step-loader` | `npx shadcn@latest add @magicui/multi-step-loader` | Scan (AI processing steps) | P1 | Pending |
| 77 | `stateful-button` | `npx shadcn@latest add @magicui/stateful-button` | All (async button states) | P1 | **INSTALLED** |

## 10.3 Complete Install Commands

```bash
# ============================================================
# TIER 1: Animation Libraries
# ============================================================
npm install animejs @react-spring/web canvas-confetti gsap @gsap/react

# ============================================================
# TIER 2: shadcn/ui Primitives
# ============================================================
npx shadcn@latest add button card dialog input label badge

# ============================================================
# TIER 3: ALREADY INSTALLED Magic UI Components
# ============================================================
# These 12 components are already installed in the project:
npx shadcn@latest add @magicui/blur-fade          # Already installed
npx shadcn@latest add @magicui/border-beam         # Already installed
npx shadcn@latest add @magicui/canvas-reveal-effect # Already installed
npx shadcn@latest add @magicui/card-spotlight      # Already installed
npx shadcn@latest add @magicui/file-upload         # Already installed
npx shadcn@latest add @magicui/floating-dock       # Already installed
npx shadcn@latest add @magicui/magic-card          # Already installed
npx shadcn@latest add @magicui/noise               # Already installed (noise-texture)
npx shadcn@latest add @magicui/number-ticker       # Already installed
npx shadcn@latest add @magicui/progressive-blur     # Already installed
npx shadcn@latest add @magicui/ripple-button        # Already installed
npx shadcn@latest add @magicui/stateful-button      # Already installed
npx shadcn@latest add @magicui/timeline             # Already installed

# ============================================================
# TIER 4: RECOMMENDED Magic UI Components to Install
# ============================================================

# --- Buttons (P0-P1) ---
npx shadcn@latest add @magicui/shimmer-button
npx shadcn@latest add @magicui/magnet-button

# --- Text Animations (P0-P1) ---
npx shadcn@latest add @magicui/shimmer-text
npx shadcn@latest add @magicui/text-animate
npx shadcn@latest add @magicui/count-up
npx shadcn@latest add @magicui/text-reveal
npx shadcn@latest add @magicui/animated-gradient-text

# --- Background Effects (P1) ---
npx shadcn@latest add @magicui/particles
npx shadcn@latest add @magicui/background-beams
npx shadcn@latest add @magicui/background-gradient
npx shadcn@latest add @magicui/dot-pattern
npx shadcn@latest add @magicui/sparkles-text
npx shadcn@latest add @magicui/meteors
npx shadcn@latest add @magicui/aurora-text

# --- Card Effects (P1) ---
npx shadcn@latest add @magicui/3d-card
npx shadcn@latest add @magicui/tilt-card
npx shadcn@latest add @magicui/tracing-beam
npx shadcn@latest add @magicui/expandable-card
npx shadcn@latest add @magicui/scroll-reveal-card
npx shadcn@latest add @magicui/shiny-card
npx shadcn@latest add @magicui/spotlight-card
npx shadcn@latest add @magicui/lens

# --- Special Effects (P1) ---
npx shadcn@latest add @magicui/confetti
npx shadcn@latest add @magicui/multi-step-loader

# --- Navigation (P1) ---
npx shadcn@latest add @magicui/bento-grid

# --- Progress/Loading (P1) ---
npx shadcn@latest add @magicui/spinner
npx shadcn@latest add @magicui/skeleton

# ============================================================
# TIER 5: OPTIONAL Magic UI Components (P2-P3)
# ============================================================
# Only install if needed after P0-P1 are complete:
# npx shadcn@latest add @magicui/animated-subscribe-button
# npx shadcn@latest add @magicui/interactive-hover-button
# npx shadcn@latest add @magicui/star-button
# npx shadcn@latest add @magicui/loop-text
# npx shadcn@latest add @magicui/spinning-text
# npx shadcn@latest add @magicui/code-comparison
# npx shadcn@latest add @magicui/morphing-text
# npx shadcn@latest add @magicui/text-rotate
# npx shadcn@latest add @magicui/text-reveal-by-word
# npx shadcn@latest add @magicui/slot-machine-text
# npx shadcn@latest add @magicui/spinning-text-circle
# npx shadcn@latest add @magicui/typing-animation
# npx shadcn@latest add @magicui/animated-beam
# npx shadcn@latest add @magicui/animated-beam-multiple
# npx shadcn@latest add @magicui/background-boxes
# npx shadcn@latest add @magicui/background-lines
# npx shadcn@latest add @magicui/flickering-grid
# npx shadcn@latest add @magicui/neon-gradient-card
# npx shadcn@latest add @magicui/waves-background
# npx shadcn@latest add @magicui/interactive-grid-pattern
# npx shadcn@latest add @magicui/grid-pattern
# npx shadcn@latest add @magicui/hover-border-gradient-card
# npx shadcn@latest add @magicui/flip-card
# npx shadcn@latest add @magicui/glowing-card
# npx shadcn@latest add @magicui/card-3d
# npx shadcn@latest add @magicui/direction-aware-hover
# npx shadcn@latest add @magicui/focus-cards
# npx shadcn@latest add @magicui/magnified-dock
# npx shadcn@latest add @magicui/parallax-scroll
# npx shadcn@latest add @magicui/safari-browser
# npx shadcn@latest add @magicui/terminal
# npx shadcn@latest add @magicui/scroll-progress
# npx shadcn@latest add @magicui/aurora-background
```

## 10.4 Magic UI Integration by Screen

### Dashboard Tab — Component Map
```
+------------------------------------------+
| [border-beam] Hero Card                  |  <- border-beam on featured card
| [number-ticker] ¥45,230                  |  <- number-ticker for budget
| [magic-card] Receipt cards               |  <- magic-card for receipts
| [sparkles-text] Total Amount             |  <- sparkles-text highlight
| [shimmer-button] Add Expense CTA         |  <- shimmer-button for CTA
| [blur-fade] Page entrance                |  <- blur-fade for stagger
| [confetti] Budget goal reached           |  <- confetti celebration
| [bento-grid] Quick stats grid            |  <- bento-grid layout
| [focus-cards] Category cards             |  <- focus-cards for stats
| [tilt-card] Hero card 3D                 |  <- tilt-card for depth
| [text-reveal] Budget reveal              |  <- text-reveal animation
| [count-up] Animated stats                |  <- count-up for numbers
+------------------------------------------+
```

### Scan Tab — Component Map
```
+------------------------------------------+
| [lens] Receipt zoom                      |  <- lens for zoom preview
| [ripple-button] Shutter button           |  <- ripple-button for capture
| [file-upload] Photo upload               |  <- file-upload component
| [multi-step-loader] AI processing        |  <- multi-step-loader
| [shimmer-text] "Scanning..." label       |  <- shimmer-text
| [blur-fade] Result transition            |  <- blur-fade for results
| [confetti] Success celebration           |  <- confetti on success
+------------------------------------------+
```

### Timeline Tab — Component Map
```
+------------------------------------------+
| [timeline] Trip itinerary                |  <- timeline component
| [tracing-beam] Activity trace            |  <- tracing-beam effect
| [background-lines] Vertical lines        |  <- background-lines
| [scroll-reveal-card] Activity cards      |  <- scroll-reveal-card
| [expandable-card] Detail view            |  <- expandable-card
| [particles] Ambient particles            |  <- particles background
+------------------------------------------+
```

### History Tab — Component Map
```
+------------------------------------------+
| [magic-card] Receipt list items          |  <- magic-card for receipts
| [scroll-reveal-card] Stagger entrance    |  <- scroll-reveal-card
| [direction-aware-hover] Receipt hover    |  <- direction-aware-hover
| [lens] Receipt zoom                      |  <- lens for detail view
| [magnet-button] Quick actions            |  <- magnet-button
+------------------------------------------+
```

### Weather Tab — Component Map
```
+------------------------------------------+
| [meteors] Night sky effect               |  <- meteors for night
| [waves-background] Ocean effect          |  <- waves-background
| [aurora-text] Weather title              |  <- aurora-text
| [particles] Ambient particles            |  <- particles
+------------------------------------------+
```

### Stats Tab — Component Map
```
+------------------------------------------+
| [3d-card] Category cards                 |  <- 3d-card for depth
| [shiny-card] Featured metric             |  <- shiny-card
| [spotlight-card] Mouse spotlight         |  <- spotlight-card
| [animated-beam] Data flow                |  <- animated-beam
| [number-ticker] Spending figures         |  <- number-ticker
| [count-up] Animated stats                |  <- count-up
| [tilt-card] Interactive cards            |  <- tilt-card
+------------------------------------------+
```

### Settings Tab — Component Map
```
+------------------------------------------+
| [card-spotlight] Option cards            |  <- card-spotlight
| [aurora-background] Ambient bg           |  <- aurora-background
| [animated-subscribe-button] Sync toggle  |  <- animated-subscribe
| [progressive-blur] Scroll blur           |  <- progressive-blur
| [bento-grid] Options grid                |  <- bento-grid
+------------------------------------------+
```

## 10.5 Updated package.json Dependencies

```json
{
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-dropdown-menu": "^1.1.1",
    "@radix-ui/react-slot": "^1.1.0",
    "@react-spring/web": "^9.7.5",
    "@tailwindcss/vite": "^4.2.4",
    "animejs": "^4.4.1",
    "canvas-confetti": "^1.9.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "gsap": "^3.12.7",
    "@gsap/react": "^2.1.1",
    "lenis": "^1.1.18",
    "lucide-react": "^1.14.0",
    "motion": "^12.38.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "tailwind-merge": "^3.5.0",
    "tailwindcss": "^4.2.4"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.1",
    "@types/canvas-confetti": "^1.6.4",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "^5.8.0",
    "vite": "^8.0.11"
  }
}
```


---

# PART 11: FREE RESOURCES (Complete Rewrite)

## 11.1 Component Libraries

### React Bits — 150+ Animated Components
- **URL**: https://reactbits.dev
- **Free**: Yes, 150+ components, MIT License
- **Install**: Copy-paste from website OR `npx shadcn@latest add "https://reactbits.dev/r/shadcn/NAME"`
- **Best for**: Text animations (SplitText, BlurText, ShinyText, GradientText), backgrounds (Aurora, Waves, Particles), loading states
- **Recommended components**:
  - `SplitText` — Heading text reveal animations
  - `BlurText` — Text blur-to-focus transitions
  - `Aurora` — Animated gradient backgrounds
  - `Waves` — Animated wave background
  - `Particles` — Interactive particle systems
  - `Magnet` — Magnetic cursor attraction effect
- **Usage**: Copy-paste React components, fully customizable

### 21st.dev — 600+ shadcn Components
- **URL**: https://21st.dev
- **Free**: Yes, community components, MIT License
- **Install**: `npx shadcn@latest add "https://21st.dev/r/USER/COMPONENT"`
- **Best for**: One-command shadcn component installs, dashboard elements, hero sections
- **Recommended components**:
  - Animated number displays
  - Interactive card grids
  - Loading skeletons
  - Form components with animations
- **Usage**: Search components on 21st.dev, install with one command

### HyperUI — 200+ Tailwind Components
- **URL**: https://hyperui.dev
- **Free**: Yes, 200+ components, all MIT
- **Install**: Copy-paste HTML + Tailwind classes
- **Best for**: Quick UI elements, marketing sections, form layouts
- **Categories**: Alerts, badges, buttons, cards, dropdowns, inputs, modals, tables, tabs
- **Usage**: Copy-paste HTML, adapt to React components
- **Note**: Great for reference and quick prototyping

### Uiverse — 7,300+ Free Elements
- **URL**: https://uiverse.io
- **Free**: Yes, all open source
- **Best for**: Button inspiration, loading states, card layouts
- **Note**: HTML/CSS only, needs manual React conversion
- **Usage**: Browse for inspiration, adapt CSS to React

### DaisyUI — Tailwind Plugin (SKIP)
- **URL**: https://daisyui.com
- **Free**: Yes, 41K+ stars
- **Recommendation**: **SKIP** — May conflict with Tailwind v4 utilities and custom design system

## 11.2 Animation Libraries

### Lenis — Smooth Scroll
- **URL**: https://lenis.darkroom.engineering
- **Free**: Yes, open source
- **Best for**: Smooth momentum scrolling on mobile and desktop
- **Install**: `npm install lenis`
- **Usage**:
```tsx
import Lenis from 'lenis';

// In App.tsx or layout component
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
});

function raf(time: number) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);
```
- **Integration**: Combine with GSAP ScrollTrigger for scroll-driven animations

### GSAP + ScrollTrigger — Professional Animation
- **URL**: https://gsap.com
- **Free**: Core + ScrollTrigger are free, premium plugins paid
- **Best for**: Complex timelines, scroll-driven animations, morphing, physics
- **Install**: `npm install gsap @gsap/react`
- **Usage**:
```tsx
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger);

// In component:
useGSAP(() => {
  gsap.from('.receipt-card', {
    y: 30,
    opacity: 0,
    stagger: 0.05,
    scrollTrigger: {
      trigger: '.receipt-list',
      start: 'top 80%',
    },
  });
});
```
- **ScrollTrigger integration**:
```tsx
// Pin dashboard hero on scroll
ScrollTrigger.create({
  trigger: '.hero-section',
  start: 'top top',
  end: '+=200',
  pin: true,
});
```

### Anime.js v4 — Complex Sequences
- **Already in project** — `npm install animejs`
- **Best for**: SVG path animations, staggered timelines, morphing
- **Usage with React**:
```tsx
import { createScope, createTimeline, utils } from 'animejs';

// Ink reveal animation
const scope = createScope({ root: ref.current }).add(() => {
  createTimeline()
    .add('.ink-element', {
      opacity: [0, 1],
      filter: ['blur(8px)', 'blur(0px)'],
      duration: 800,
      ease: 'cubicBezier(0.25, 0.1, 0.25, 1)',
    });
});
```

## 11.3 Icon Libraries

### Lucide React (Primary — Already Installed)
```bash
# Already in project
npm install lucide-react
```
- 1,400+ icons, consistent style
- Usage: `import { Camera, Plus, Settings } from 'lucide-react';`

### Tabler Icons (Secondary)
```bash
npm install @tabler/icons-react
```
- 4,500+ icons, clean minimal style
- Best for: Alternative icons, more variety than Lucide
- Usage: `import { IconCamera, IconPlus } from '@tabler/icons-react';`

### Phosphor Icons (Flexible Weights)
```bash
npm install @phosphor-icons/react
```
- 7,000+ icons with weight system (Thin, Light, Regular, Bold, Fill, Duotone)
- Best for: Customizable icon weights for different contexts
- Usage: `import { Camera, Plus } from '@phosphor-icons/react';`
- Supports tree-shaking, React Server Components

## 11.4 Japanese Design Resources

### NIPPON COLORS — Traditional Japanese Color Palette
- **URL**: https://nipponcolors.com
- **Free**: Yes, 250 traditional Japanese colors
- **Best for**: Authentic color selection with Japanese names
- **Key colors for this project**:
  - `#F8F4E6` — Shironeri (白練) — Off-white paper
  - `#C18A26` — Kincha (金茶) — Gold/ochre accent
  - `#672529` — Azuki (小豆) — Deep red
  - `#1A1A1A` — Sumi (墨) — Ink black
  - `#4A7AB5` — Sora (空) — Sky blue
  - `#9B7CB9` — Fuji (藤) — Purple
  - `#D4A843` — Yamabuki (山吹) — Gold highlight
  - `#FFC0CB` — Sakura (桜) — Cherry blossom

### Japanese Pattern CSS

#### Seigaiha (青海波 — Blue Sea Waves)
```css
/* SVG Data URI for Seigaiha pattern */
--pattern-seigaiha: url("data:image/svg+xml,%3Csvg width='60' height='30' viewBox='0 0 60 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232c2421' fill-opacity='0.06'%3E%3Cpath d='M30 0c-8.284 0-15 6.716-15 15 0 8.284 6.716 15 15 15 8.284 0 15-6.716 15-15 0-8.284-6.716-15-15-15zm0 4c6.075 0 11 4.925 11 11s-4.925 11-11 11-11-4.925-11-11 4.925-11 11-11z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
```
- Symbolizes peace, tranquility, good fortune
- **Usage**: Dashboard card backgrounds, subtle overlay at 4% opacity

#### Asanoha (麻の葉 — Hemp Leaf)
```css
/* SVG Data URI for Asanoha pattern */
--pattern-asanoha: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%232c2421' fill-opacity='0.05' fill-rule='evenodd'%3E%3Cpath d='M20 0l10 5.774v11.547L20 23.094l-10-5.773V5.774L20 0zm0 2.309L12.5 6.637v8.726L20 19.691l7.5-4.328V6.637L20 2.309z'/%3E%3Cpath d='M0 10l10 5.774v11.547L0 33.094l-10-5.773V15.774L0 10zm0 2.309L-7.5 16.637v8.726L0 29.691l7.5-4.328v-8.726L0 12.309z' transform='translate(0 0)'/%3E%3Cpath d='M40 10l10 5.774v11.547L40 33.094l-10-5.773V15.774L40 10zm0 2.309L32.5 16.637v8.726L40 29.691l7.5-4.328v-8.726L40 12.309z'/%3E%3Cpath d='M20 20l10 5.774v11.547L20 43.094l-10-5.773V25.774L20 20zm0 2.309L12.5 26.637v8.726L20 39.691l7.5-4.328v-8.726L20 22.309z'/%3E%3C/g%3E%3C/svg%3E");
```
- Symbolizes growth, resilience, protection
- **Usage**: Timeline card backgrounds, subtle overlay at 5% opacity

#### Shippo (七宝 — Seven Treasures)
```css
/* SVG Data URI for Shippo pattern */
--pattern-shippo: url("data:image/svg+xml,%3Csvg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232c2421' fill-opacity='0.04'%3E%3Ccircle cx='24' cy='24' r='16'/%3E%3Ccircle cx='0' cy='0' r='16'/%3E%3Ccircle cx='48' cy='0' r='16'/%3E%3Ccircle cx='0' cy='48' r='16'/%3E%3Ccircle cx='48' cy='48' r='16'/%3E%3Cpath d='M24 8c8.837 0 16 7.163 16 16s-7.163 16-16 16S8 32.837 8 24 15.163 8 24 8zm0 4c6.627 0 12 5.373 12 12s-5.373 12-12 12S12 30.627 12 24s5.373-12 12-12z' fill-opacity='0.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
```
- Symbolizes harmony, good relationships, eternal prosperity
- **Usage**: Weather card backgrounds at 4% opacity

### Pattern Usage by Screen

| Screen | Primary Pattern | Secondary Pattern | Opacity |
|--------|----------------|-------------------|---------|
| Dashboard | Seigaiha | — | 0.04 |
| Timeline | Asanoha | — | 0.05 |
| History | Seigaiha | — | 0.03 |
| Weather | Shippo | — | 0.04 |
| Stats | Asanoha | — | 0.06 |
| Settings | Seigaiha | — | 0.03 |
| Scan | None (clean) | — | 0 |

### Japanese Fonts (Google Fonts)
```html
<!-- In index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Serif+JP:wght@400;600;700&family=Zen+Old+Mincho:wght@400;700&display=swap" rel="stylesheet">
```

| Font | Weights | Usage |
|------|---------|-------|
| Noto Serif JP | 400, 600, 700 | Display headings, hero text |
| Noto Sans JP | 400, 500, 600, 700 | Body text, UI labels |
| Zen Old Mincho | 400, 700 | Calligraphic accents |
| JetBrains Mono | 400, 600, 700 | Numbers, amounts, code |

## 11.5 LottieFiles — Free JSON Animations
- **URL**: https://lottiefiles.com
- **Free**: Thousands of free animations
- **Install**: `npm install @lottiefiles/react-lottie-player`
- **Best for**: Loading animations, empty states, celebrations
- **Recommended**:
  - Empty state illustration (suitcase + cherry blossoms)
  - Sync loading animation (circular progress)
  - Success checkmark animation
  - Cherry blossom falling animation

## 11.6 Rive — Interactive Animations
- **URL**: https://rive.app
- **Free**: Yes (community plan)
- **Best for**: Complex interactive animations, game-like interactions
- **Recommended**: **CONSIDER** for future enhancements (advanced loading states)

## 11.7 Complete Resource Summary

| Resource | Type | Install | Count | Priority |
|----------|------|---------|-------|----------|
| React Bits | Components | Copy-paste | 150+ | P1 |
| 21st.dev | Components | `npx shadcn add "https://21st.dev/..."` | 600+ | P1 |
| HyperUI | Components | Copy-paste | 200+ | P2 |
| Lenis | Animation | `npm install lenis` | 1 | P0 |
| GSAP + ScrollTrigger | Animation | `npm install gsap @gsap/react` | 1 | P1 |
| Tabler Icons | Icons | `npm install @tabler/icons-react` | 4500+ | P2 |
| Phosphor Icons | Icons | `npm install @phosphor-icons/react` | 7000+ | P1 |
| NIPPON COLORS | Reference | Web | 250 | P0 |
| Japanese Patterns | CSS | Copy-paste | 5 patterns | P0 |
| LottieFiles | Animations | `npm install @lottiefiles/react-lottie-player` | 1000s | P2 |


---

# PART 12: JAPANESE ART EFFECTS (NEW SECTION)

A comprehensive guide to recreating seven Japanese traditional art forms as practical CSS and React effects. Each section includes cultural context, complete copy-pasteable CSS, React components, animations, usage recommendations, and performance analysis.

## Color Palette Reference

```css
:root {
  /* Japanese Color Palette */
  --shironeri: #f8f4e6;      /* Off-white (paper) */
  --kincha: #c18a26;          /* Gold/ochre */
  --azuki: #672529;           /* Deep red */
  --sumi: #1a1a1a;            /* Ink black */
  --sora: #4a7ab5;            /* Sky blue */
  --fuji: #9b7cb9;            /* Purple */
  --sakura-pink: #ffc0cb;     /* Cherry blossom */
  --momo: #e08da6;            /* Pink */
  --wakakusa: #c8d85c;        /* Yellow-green */
  --moegi: #5b8c5a;           /* Green */
  --kintsugi-gold: #d4a843;   /* Gold for kintsugi */
  --hai: #95959c;             /* Ash grey */
  --kurotsurubami: #181614;   /* Black-brown */
  --gofun: #fffff4;           /* Shell white */
  --byakugun: #dde5ec;        /* Light grey-blue */
}
```

---

## 12.1 Origami (摺紙) — Paper Folding Effect

**Cultural Significance**: Origami (ori = fold, kami = paper) dates back to the 6th century. The crane (tsuru) symbolizes peace, longevity, and good fortune. Each fold represents transformation.

### Origami Folded Paper Card — CSS

```css
/* === ORIGAMI FOLDED CARD === */

.origami-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: linear-gradient(145deg, #fffef5 0%, #f5f0e0 100%);
  border-radius: 2px;
  box-shadow:
    0 1px 2px rgba(0,0,0,0.12),
    0 4px 8px rgba(0,0,0,0.08),
    0 8px 16px rgba(0,0,0,0.04);
  padding: 24px;
  /* The folded corner effect */
  clip-path: polygon(
    0 0,
    calc(100% - 40px) 0,
    100% 40px,
    100% 100%,
    0 100%
  );
  transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              box-shadow 0.4s ease;
}

.origami-card:hover {
  transform: translateY(-4px) rotateX(2deg);
  box-shadow:
    0 4px 8px rgba(0,0,0,0.14),
    0 8px 16px rgba(0,0,0,0.1),
    0 16px 32px rgba(0,0,0,0.06);
}

/* Folded triangle corner */
.origami-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 40px;
  height: 40px;
  background: linear-gradient(
    225deg,
    transparent 50%,
    rgba(200, 180, 140, 0.35) 50%,
    rgba(180, 160, 120, 0.5) 70%,
    rgba(160, 140, 100, 0.6) 100%
  );
  box-shadow: -2px 2px 4px rgba(0,0,0,0.1);
  transition: all 0.3s ease;
}

/* Crease line shadow */
.origami-card::after {
  content: '';
  position: absolute;
  top: 0;
  right: 40px;
  width: 1px;
  height: 40px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(0,0,0,0.08) 40%,
    rgba(0,0,0,0.12) 100%
  );
  transform-origin: top;
  transform: rotate(-45deg);
}
```

### Origami Unfold Animation

```css
@keyframes unfold {
  0% {
    clip-path: polygon(
      calc(100% - 40px) 40px,
      calc(100% - 40px) 40px,
      100% 40px,
      100% 40px,
      0 100%,
      0 100%
    );
    opacity: 0;
  }
  50% {
    clip-path: polygon(
      0 0,
      calc(100% - 40px) 0,
      100% 40px,
      100% 40px,
      0 100%,
      0 100%
    );
    opacity: 0.7;
  }
  100% {
    clip-path: polygon(
      0 0,
      calc(100% - 40px) 0,
      100% 40px,
      100% 100%,
      0 100%,
      0 0
    );
    opacity: 1;
  }
}

.origami-card-unfolding {
  animation: unfold 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
```

### Receipt-Style Origami Card

```css
/* Receipt-style origami fold (for expense cards) */
.receipt-origami {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: #fffef5;
  padding: 24px;
  margin: 16px 0;
  /* Zigzag bottom edge */
  clip-path: polygon(
    0 0, 100% 0, 100% calc(100% - 12px),
    95% 100%, 90% calc(100% - 12px),
    85% 100%, 80% calc(100% - 12px),
    75% 100%, 70% calc(100% - 12px),
    65% 100%, 60% calc(100% - 12px),
    55% 100%, 50% calc(100% - 12px),
    45% 100%, 40% calc(100% - 12px),
    35% 100%, 30% calc(100% - 12px),
    25% 100%, 20% calc(100% - 12px),
    15% 100%, 10% calc(100% - 12px),
    5% 100%, 0 calc(100% - 12px)
  );
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

/* Receipt fold lines */
.receipt-origami .fold-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 4px,
    rgba(0,0,0,0.06) 4px,
    rgba(0,0,0,0.06) 8px
  );
}
```

### Origami React Component

```tsx
// components/OrigamiCard.tsx
import React from 'react';
import './OrigamiCard.css';

interface OrigamiCardProps {
  title?: string;
  children: React.ReactNode;
  variant?: 'default' | 'receipt' | 'unfolding';
  className?: string;
  onClick?: () => void;
}

export const OrigamiCard: React.FC<OrigamiCardProps> = ({
  title,
  children,
  variant = 'default',
  className = '',
  onClick,
}) => {
  const cardClass = [
    'origami-card',
    variant === 'receipt' ? 'receipt-origami' : '',
    variant === 'unfolding' ? 'origami-card-unfolding' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClass}
      onClick={onClick}
      role="article"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {title && <h3 className="origami-title">{title}</h3>}
      <div className="origami-content">{children}</div>
    </div>
  );
};

// Receipt card for expense items
interface ReceiptCardProps {
  merchant: string;
  date: string;
  amount: number;
  currency?: string;
  items?: { name: string; price: number }[];
  emoji?: string;
  category?: string;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  merchant,
  date,
  amount,
  currency = 'JPY',
  items = [],
  emoji = '🧾',
}) => {
  return (
    <div className="receipt-origami">
      <div className="fold-line" style={{ top: '33%' }} />
      <div className="fold-line" style={{ top: '66%' }} />

      <div className="receipt-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>{emoji}</span>
          <h4 className="receipt-merchant" style={{
            fontFamily: "'Noto Serif JP', serif",
            fontSize: '16px',
            fontWeight: 600,
            margin: 0,
          }}>{merchant}</h4>
        </div>
        <span className="receipt-date" style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '12px',
          color: '#8b7d6b',
        }}>{date}</span>
      </div>

      {items.length > 0 && (
        <div className="receipt-items" style={{ marginBottom: '12px' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              padding: '4px 0',
              color: '#5a5048',
            }}>
              <span>{item.name}</span>
              <span>{currency} {item.price.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="receipt-total" style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px dashed rgba(0,0,0,0.1)',
        paddingTop: '12px',
        fontWeight: 700,
      }}>
        <strong style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>Total</strong>
        <strong style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '18px',
          color: '#d45a5a',
        }}>
          {currency} {amount.toLocaleString()}
        </strong>
      </div>
    </div>
  );
};

// Unfold animation wrapper
export const UnfoldWrapper: React.FC<{
  children: React.ReactNode;
  delay?: number;
}> = ({ children, delay = 0 }) => {
  const [isVisible, setIsVisible] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={isVisible ? 'origami-card-unfolding' : ''}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'none' : 'perspective(800px) rotateX(-15deg)',
        transition: `all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};
```

### Usage in Travel Expense App

| Screen | Element | Application |
|--------|---------|-------------|
| Expense List | Receipt cards | Receipt-style origami cards for each expense entry |
| Dashboard | Summary cards | Folded corner cards for budget summaries |
| Transaction Detail | Detail view | Unfold animation when opening transaction details |

---

## 12.2 Byobu (屏風) — Folding Screen Effect

**Cultural Significance**: Byobu (屏風, "wind wall") are Japanese folding screens used since the Nara period (710-794). They represent *ma* — the meaningful space between things. The fold lines create rhythm and anticipation.

### Byobu Folding Screen — CSS

```css
/* === BYOBU FOLDING SCREEN === */

.byobu-container {
  display: flex;
  perspective: 1500px;
  perspective-origin: center center;
  width: 100%;
  height: 400px;
  position: relative;
  overflow: hidden;
}

/* Individual panel */
.byobu-panel {
  flex: 1;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.9s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left center;
  backface-visibility: hidden;
}

/* Panel front face */
.byobu-panel::before {
  content: attr(data-content);
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.1) 0%,
    rgba(0,0,0,0.05) 3%,
    transparent 6%,
    transparent 94%,
    rgba(0,0,0,0.05) 97%,
    rgba(255,255,255,0.1) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: #333;
  border-left: 1px solid rgba(0,0,0,0.08);
  border-right: 1px solid rgba(0,0,0,0.08);
}

/* Fold line between panels */
.byobu-panel::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 2px;
  height: 100%;
  background: linear-gradient(
    180deg,
    rgba(0,0,0,0.15) 0%,
    rgba(0,0,0,0.3) 50%,
    rgba(0,0,0,0.15) 100%
  );
  z-index: 10;
}

/* Alternate panel colors for depth */
.byobu-panel:nth-child(odd) {
  background: linear-gradient(135deg, #f8f4e6 0%, #e8e0d0 100%);
}

.byobu-panel:nth-child(even) {
  background: linear-gradient(135deg, #f0ece0 0%, #e0d8c8 100%);
}

/* Panel folding states */
.byobu-panel.folded {
  transform: rotateY(-105deg);
}

.byobu-panel.half-folded {
  transform: rotateY(-55deg);
}

/* Hinge shadow */
.byobu-hinge {
  position: absolute;
  left: 0;
  top: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(
    180deg,
    #b8a880 0%,
    #d4c4a0 10%,
    #b8a880 20%,
    #d4c4a0 30%,
    #b8a880 40%,
    #d4c4a0 50%,
    #b8a880 60%,
    #d4c4a0 70%,
    #b8a880 80%,
    #d4c4a0 90%,
    #b8a880 100%
  );
  z-index: 20;
  box-shadow: 1px 0 3px rgba(0,0,0,0.2);
}

/* Decorative gold border (byobu frame) */
.byobu-frame {
  border: 8px solid;
  border-image: linear-gradient(
    135deg,
    #c8a84e 0%,
    #e8d08a 25%,
    #f0e0a0 50%,
    #e8d08a 75%,
    #c8a84e 100%
  ) 1;
}
```

### Byobu Tab Transition — CSS

```css
/* === BYOBU TAB TRANSITION === */

.byobu-tab-container {
  position: relative;
  width: 100%;
  min-height: 300px;
  perspective: 2000px;
}

.byobu-tab-panel {
  position: absolute;
  inset: 0;
  transform-origin: right center;
  transition: all 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
}

.byobu-tab-panel.entering {
  transform: rotateY(-90deg);
  opacity: 0;
}

.byobu-tab-panel.active {
  transform: rotateY(0deg);
  opacity: 1;
  z-index: 2;
}

.byobu-tab-panel.exiting {
  transform: rotateY(45deg);
  opacity: 0;
  z-index: 1;
}

/* Byobu open/close keyframes */
@keyframes byobuOpen {
  0% { transform: rotateY(-95deg); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: rotateY(0deg); opacity: 1; }
}

@keyframes byobuClose {
  0% { transform: rotateY(0deg); opacity: 1; }
  70% { opacity: 0; }
  100% { transform: rotateY(95deg); opacity: 0; }
}
```

### Byobu React Component

```tsx
// components/Byobu.tsx
import React, { useState, useCallback } from 'react';

interface ByobuPanelData {
  id: string;
  content: React.ReactNode;
  bgImage?: string;
  accentColor?: string;
}

interface ByobuProps {
  panels: ByobuPanelData[];
  className?: string;
}

export const Byobu: React.FC<ByobuProps> = ({ panels, className = '' }) => {
  const [foldedPanels, setFoldedPanels] = useState<Set<string>>(new Set());

  const togglePanel = useCallback((id: string) => {
    setFoldedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className={`byobu-container ${className}`}>
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          className={`byobu-panel ${foldedPanels.has(panel.id) ? 'folded' : ''}`}
          data-content={`Panel ${index + 1}`}
          style={{
            zIndex: panels.length - index,
            background: panel.accentColor
              ? `linear-gradient(135deg, ${panel.accentColor}22 0%, ${panel.accentColor}44 100%)`
              : undefined,
          }}
          onClick={() => togglePanel(panel.id)}
        >
          {panel.bgImage && (
            <div style={{
              backgroundImage: `url(${panel.bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.3,
              position: 'absolute',
              inset: 0,
            }} />
          )}
          <div style={{ position: 'relative', zIndex: 2 }}>
            {panel.content}
          </div>
          {index > 0 && <div className="byobu-hinge" />}
        </div>
      ))}
    </div>
  );
};

// Byobu-style tab transition
interface ByobuTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface ByobuTabsProps {
  tabs: ByobuTab[];
  defaultTab?: string;
}

export const ByobuTabs: React.FC<ByobuTabsProps> = ({
  tabs,
  defaultTab,
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
  const [transitioning, setTransitioning] = useState(false);

  const handleTabChange = useCallback((tabId: string) => {
    if (tabId === activeTab || transitioning) return;
    setTransitioning(true);
    setTimeout(() => {
      setActiveTab(tabId);
      setTimeout(() => setTransitioning(false), 50);
    }, 350);
  }, [activeTab, transitioning]);

  return (
    <div className="byobu-tabs">
      <div className="byobu-tab-headers" style={{
        display: 'flex',
        borderBottom: '2px solid var(--kincha, #c18a26)',
        marginBottom: '16px',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab.id ? 'var(--kincha, #c18a26)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#666',
              border: 'none',
              borderTopLeftRadius: '4px',
              borderTopRightRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              transform: activeTab === tab.id ? 'translateY(-2px)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="byobu-tab-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`byobu-tab-panel ${
              tab.id === activeTab ? 'active' : transitioning ? 'exiting' : 'entering'
            }`}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Performance

| Metric | Impact | Notes |
|--------|--------|-------|
| Perspective | Low | Creates GPU layer once |
| Transform 3D | Low | GPU-composited |
| Backface-visibility | Low | Minimal impact |
| **Overall** | **Low-Medium** | Limit to 4-6 panels; use `will-change` on active panels only |

---

## 12.3 Washi (和紙) — Traditional Paper Texture

**Cultural Significance**: Washi is traditional Japanese paper made from gampi, mitsumata, or kozo fibers. UNESCO Intangible Cultural Heritage (2014). Its organic texture embodies *wabi-sabi*.

### Washi Paper Texture — CSS

```css
/* === WASHI PAPER TEXTURE === */

/* Base washi paper texture using SVG filter */
.washi-paper {
  position: relative;
  background: #f8f4e6;
  padding: 24px;
  border-radius: 3px;
  /* Subtle edge irregularity */
  clip-path: polygon(
    0% 1%, 2% 0%, 50% 0.5%, 98% 0%, 100% 1%,
    100% 99%, 98% 100%, 50% 99.5%, 2% 100%, 0% 99%
  );
}

/* SVG filter definition (include in HTML once) */
/*
<svg class="washi-filter-defs" style="position:absolute;width:0;height:0;pointer-events:none;">
  <filter id="washi-texture">
    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" seed="2" result="noise" />
    <feDiffuseLighting in="noise" lighting-color="#f8f4e6" surfaceScale="1.5" result="light">
      <feDistantLight azimuth="45" elevation="60" />
    </feDiffuseLighting>
    <feBlend in="SourceGraphic" in2="light" mode="multiply" />
  </filter>
</svg>
*/

/* Pure CSS washi texture using radial gradients */
.washi-css-only {
  background:
    /* Fiber overlay */
    radial-gradient(ellipse 2px 8px at 12% 23%, rgba(180, 170, 140, 0.15) 50%, transparent 50%),
    radial-gradient(ellipse 1px 6px at 67% 45%, rgba(160, 150, 130, 0.12) 50%, transparent 50%),
    radial-gradient(ellipse 3px 10px at 89% 78%, rgba(170, 160, 140, 0.1) 50%, transparent 50%),
    radial-gradient(ellipse 2px 7px at 34% 67%, rgba(165, 155, 135, 0.13) 50%, transparent 50%),
    radial-gradient(ellipse 1px 5px at 78% 12%, rgba(175, 165, 145, 0.11) 50%, transparent 50%),
    /* Multiple noise layers for fiber texture */
    repeating-radial-gradient(circle at 25% 25%, transparent 0, transparent 2px, rgba(160, 150, 120, 0.03) 3px, transparent 4px),
    repeating-radial-gradient(circle at 75% 75%, transparent 0, transparent 3px, rgba(150, 140, 110, 0.025) 4px, transparent 5px),
    /* Base paper color with warm gradient */
    linear-gradient(170deg, #faf7ed 0%, #f5f0e0 30%, #f0ebe0 60%, #ede8dc 100%);
  background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 8px 8px, 12px 12px, 100% 100%;
  padding: 24px;
  position: relative;
}

/* Semi-translucent washi overlay */
.washi-translucent {
  background: rgba(248, 244, 230, 0.85);
  backdrop-filter: blur(2px);
  position: relative;
}

/* Ink bleeding effect on washi */
.ink-on-washi {
  position: relative;
  color: #1a1a1a;
  font-family: 'Noto Serif JP', 'Hiragino Mincho ProN', serif;
}

.ink-on-washi::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(26, 26, 26, 0.4) 0%,
    rgba(26, 26, 26, 0.15) 50%,
    rgba(26, 26, 26, 0.05) 100%
  );
  filter: blur(0.5px);
}
```

### Washi React Component

```tsx
// components/WashiPaper.tsx
import React from 'react';

// SVG filter component (render once at app root)
export const WashiFilterDefs: React.FC = () => (
  <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} aria-hidden="true">
    <filter id="washi-texture" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" seed="2" result="noise" />
      <feDiffuseLighting in="noise" lightingColor="#f8f4e6" surfaceScale="1.5" result="light">
        <feDistantLight azimuth="45" elevation="60" />
      </feDiffuseLighting>
      <feBlend in="SourceGraphic" in2="light" mode="multiply" />
    </filter>
    {/* Secondary finer texture */}
    <filter id="washi-fine">
      <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="5" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.05" />
      </feComponentTransfer>
    </filter>
  </svg>
);

interface WashiPaperProps {
  children: React.ReactNode;
  variant?: 'default' | 'translucent' | 'css-only' | 'animated';
  className?: string;
  style?: React.CSSProperties;
}

export const WashiPaper: React.FC<WashiPaperProps> = ({
  children,
  variant = 'css-only',
  className = '',
  style,
}) => {
  const variantClass = {
    default: 'washi-paper',
    translucent: 'washi-translucent',
    'css-only': 'washi-css-only',
    animated: 'washi-animated washi-css-only',
  }[variant];

  return (
    <div className={`${variantClass} ${className}`} style={style}>
      {children}
    </div>
  );
};

// Ink text component with bleeding effect
interface InkOnWashiProps {
  text: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

export const InkOnWashi: React.FC<InkOnWashiProps> = ({
  text,
  className = '',
  as: Tag = 'span',
}) => (
  <Tag className={`ink-on-washi ${className}`}>{text}</Tag>
);

// Pre-computed background pattern for washi (no SVG filter needed)
export const WashiBackground: React.FC<{
  children: React.ReactNode;
  opacity?: number;
}> = ({ children, opacity = 1 }) => (
  <div style={{
    background: `
      repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(180, 170, 140, 0.03) 3px, rgba(180, 170, 140, 0.03) 6px),
      repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(170, 160, 130, 0.025) 5px, rgba(170, 160, 130, 0.025) 10px),
      linear-gradient(170deg, #faf7ed 0%, #f0ebe0 100%)
    `,
    opacity,
    minHeight: '100vh',
    position: 'relative',
  }}>
    {children}
  </div>
);
```

---

## 12.4 Japanese Patterns — Seigaiha, Asanoha CSS

### Seigaiha (青海波 — Blue Sea Waves)
```css
/* === SEIGAIHA — BLUE OCEAN WAVES === */

.seigaiha-bg {
  background-color: #e8f0f5;
  background-image:
    radial-gradient(circle at 50% 100%, transparent 40%, rgba(100, 160, 200, 0.15) 41%, rgba(100, 160, 200, 0.15) 43%, transparent 44%),
    radial-gradient(circle at 50% 100%, transparent 25%, rgba(100, 160, 200, 0.12) 26%, rgba(100, 160, 200, 0.12) 28%, transparent 29%),
    radial-gradient(circle at 50% 100%, transparent 10%, rgba(100, 160, 200, 0.08) 11%, rgba(100, 160, 200, 0.08) 13%, transparent 14%);
  background-size: 60px 30px;
}

/* Modern simplified seigaiha using SVG data URI */
.seigaiha-svg {
  background-color: #f0ece0;
  background-image: url("data:image/svg+xml,%3Csvg width='60' height='30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 30 Q15 5 30 30 Q45 5 60 30' fill='none' stroke='%23a0c0d0' stroke-width='1' opacity='0.3'/%3E%3Cpath d='M0 30 Q15 15 30 30 Q45 15 60 30' fill='none' stroke='%23a0c0d0' stroke-width='1' opacity='0.2'/%3E%3C/svg%3E");
}
```
- Symbolizes peace, tranquility, good fortune
- **Usage**: Dashboard card backgrounds, subtle overlay

### Asanoha (麻の葉 — Hemp Leaf)
```css
/* === ASANOHA — HEMP LEAF PATTERN === */

.asanoha-bg {
  background-color: #f8f4e6;
  background-image:
    linear-gradient(30deg, transparent 49.5%, rgba(140, 120, 80, 0.2) 49.5%, rgba(140, 120, 80, 0.2) 50.5%, transparent 50.5%),
    linear-gradient(-30deg, transparent 49.5%, rgba(140, 120, 80, 0.2) 49.5%, rgba(140, 120, 80, 0.2) 50.5%, transparent 50.5%),
    linear-gradient(90deg, transparent 49.5%, rgba(140, 120, 80, 0.2) 49.5%, rgba(140, 120, 80, 0.2) 50.5%, transparent 50.5%),
    linear-gradient(30deg, transparent 49.5%, rgba(140, 120, 80, 0.12) 49.5%, rgba(140, 120, 80, 0.12) 50.5%, transparent 50.5%),
    linear-gradient(-30deg, transparent 49.5%, rgba(140, 120, 80, 0.12) 49.5%, rgba(140, 120, 80, 0.12) 50.5%, transparent 50.5%);
  background-size: 40px 69px, 40px 69px, 40px 69px, 40px 69px, 40px 69px;
  background-position: 0 0, 0 0, 20px 34.5px, 20px 34.5px, 20px 34.5px;
}
```
- Symbolizes growth, resilience, protection
- **Usage**: Timeline card backgrounds, expense list items

### Unified Pattern System
```css
/* === JAPANESE PATTERN SYSTEM === */

.wagara {
  --pattern-color: rgba(140, 120, 80, 0.2);
  --pattern-bg: #f8f4e6;
  --pattern-size: 40px;
  background-color: var(--pattern-bg);
}

.wagara-seigaiha {
  background-image:
    radial-gradient(circle at 50% 100%, transparent 40%, var(--pattern-color) 41%, var(--pattern-color) 43%, transparent 44%),
    radial-gradient(circle at 50% 100%, transparent 25%, var(--pattern-color) 26%, var(--pattern-color) 28%, transparent 29%),
    radial-gradient(circle at 50% 100%, transparent 10%, var(--pattern-color) 11%, var(--pattern-color) 13%, transparent 14%);
  background-size: calc(var(--pattern-size) * 1.5) calc(var(--pattern-size) * 0.75);
}

.wagara-asanoha {
  background-image:
    linear-gradient(30deg, transparent 49.5%, var(--pattern-color) 49.5%, var(--pattern-color) 50.5%, transparent 50.5%),
    linear-gradient(-30deg, transparent 49.5%, var(--pattern-color) 49.5%, var(--pattern-color) 50.5%, transparent 50.5%),
    linear-gradient(90deg, transparent 49.5%, var(--pattern-color) 49.5%, var(--pattern-color) 50.5%, transparent 50.5%);
  background-size: var(--pattern-size) calc(var(--pattern-size) * 1.732);
}

/* Subtle overlay variant */
.wagara-subtle {
  --pattern-color: rgba(140, 120, 80, 0.08);
}
```

---

## 12.5 Sumi-e (墨絵) — Ink Wash Effect

**Cultural Significance**: Sumi-e is Japanese ink wash painting using black ink. It emphasizes *less is more* — capturing the spirit (*ki*) with minimal brushstrokes. Connected to Zen Buddhism.

### Ink Wash CSS

```css
/* === SUMI-E INK WASH === */

/* Ink wash gradient background */
.sumi-wash-bg {
  background: linear-gradient(
    160deg,
    #1a1a1a 0%, #2a2a2a 15%, #3a3a3a 30%, #555 45%,
    #888 60%, #bbb 75%, #ddd 88%, #eee 100%
  );
  position: relative;
  overflow: hidden;
}

/* Ink stroke element */
.ink-stroke {
  position: relative;
  display: inline-block;
}

.ink-stroke::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 60%, transparent 100%);
  border-radius: 50% 0 0 50%;
  filter: blur(0.5px);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.ink-stroke.active::after,
.ink-stroke:hover::after {
  transform: scaleX(1);
}

/* Ink reveal animation */
@keyframes inkReveal {
  0% {
    clip-path: circle(0% at 50% 50%);
    filter: blur(10px);
    opacity: 0;
  }
  30% { opacity: 0.7; }
  100% {
    clip-path: circle(75% at 50% 50%);
    filter: blur(0px);
    opacity: 1;
  }
}

@keyframes inkSpread {
  0% { transform: scale(0); opacity: 0.8; filter: blur(4px); }
  50% { opacity: 0.5; filter: blur(2px); }
  100% { transform: scale(3); opacity: 0; filter: blur(1px); }
}

.ink-reveal {
  animation: inkReveal 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

/* Brush stroke text underline */
.brush-underline {
  position: relative;
  display: inline-block;
  padding-bottom: 8px;
}

.brush-underline::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: -4px;
  right: -4px;
  height: 4px;
  background: url("data:image/svg+xml,%3Csvg width='100' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 4 Q10 1 20 4 Q30 7 40 4 Q50 1 60 4 Q70 7 80 4 Q90 1 100 4' stroke='%231a1a1a' stroke-width='2' fill='none'/%3E%3C/svg%3E");
  background-size: 100% 100%;
  opacity: 0.6;
}
```

### Sumi-e Number Reveal (React)

```tsx
// components/NumberInk.tsx
import React, { useState, useEffect, useRef } from 'react';

interface SumiNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
}

export const SumiNumber: React.FC<SumiNumberProps> = ({
  value,
  prefix = '',
  suffix = '',
  duration = 1500,
  delay = 0,
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) setIsVisible(true);
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const timeout = setTimeout(() => {
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(Math.round(value * eased));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timeout);
  }, [isVisible, value, duration, delay]);

  return (
    <span ref={ref} style={{
      fontFamily: "'Noto Serif JP', 'Times New Roman', serif",
      fontSize: '4rem',
      fontWeight: 300,
      color: '#1a1a1a',
      position: 'relative',
      display: 'inline-block',
    }}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </span>
  );
};

// Ink wash reveal wrapper
interface InkRevealProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
}

export const InkReveal: React.FC<InkRevealProps> = ({
  children,
  delay = 0,
  duration = 1200,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} style={{
      clipPath: isVisible ? 'circle(75% at 50% 50%)' : 'circle(0% at 50% 50%)',
      filter: isVisible ? 'blur(0px)' : 'blur(10px)',
      opacity: isVisible ? 1 : 0,
      transition: `all ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      transitionDelay: `${delay}ms`,
    }}>
      {children}
    </div>
  );
};
```

---

## 12.6 Kintsugi (金繼) — Gold Repair Lines

**Cultural Significance**: Kintsugi is the Japanese art of repairing broken pottery with gold-dusted lacquer. It embodies *wabi-sabi* — embracing imperfection and treating damage as part of an object's unique history.

### Kintsugi CSS

```css
/* === KINTSUGI GOLD REPAIR === */

/* Gold accent line */
.kintsugi-line {
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #d4a843 15%,
    #f0d080 50%,
    #d4a843 85%,
    transparent 100%
  );
  position: relative;
}

.kintsugi-line::after {
  content: '';
  position: absolute;
  inset: -1px;
  background: inherit;
  filter: blur(2px);
  opacity: 0.5;
}

/* Gold shimmer animation */
@keyframes goldShimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.kintsugi-shimmer {
  background: linear-gradient(
    90deg, #b8962e 0%, #d4a843 20%, #f0d080 40%,
    #d4a843 60%, #b8962e 80%, #d4a843 100%
  );
  background-size: 200% 100%;
  animation: goldShimmer 3s ease-in-out infinite;
}

/* Crack line with organic shape */
.kintsugi-crack {
  position: relative;
  width: 100%;
  height: 3px;
}

.kintsugi-crack-main {
  position: absolute;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg, transparent, #d4a843 20%, #f0d080 50%, #d4a843 80%, transparent
  );
  clip-path: polygon(
    0% 40%, 20% 20%, 40% 60%, 60% 10%, 80% 50%, 100% 30%,
    100% 70%, 80% 90%, 60% 40%, 40% 80%, 20% 60%, 0% 70%
  );
}

/* Section divider */
.kintsugi-section-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 40px 0;
}

.kintsugi-section-divider::before,
.kintsugi-section-divider::after {
  content: '';
  flex: 1;
  height: 2px;
  background: linear-gradient(
    90deg, transparent 0%, #d4a843 30%, #f0d080 50%, #d4a843 70%, transparent 100%
  );
}

.kintsugi-section-divider-icon {
  width: 12px;
  height: 12px;
  background: radial-gradient(circle, #f0d080 0%, #d4a843 100%);
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(212, 168, 67, 0.5);
  flex-shrink: 0;
}

/* Crack draw animation */
@keyframes kintsugiDraw {
  0% { clip-path: inset(0 100% 0 0); }
  100% { clip-path: inset(0 0 0 0); }
}

.kintsugi-draw {
  animation: kintsugiDraw 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
```

### Kintsugi React Component

```tsx
// components/KintsugiDivider.tsx
import React from 'react';

interface KintsugiDividerProps {
  variant?: 'simple' | 'crack' | 'shimmer' | 'section';
  className?: string;
  animate?: boolean;
}

export const KintsugiDivider: React.FC<KintsugiDividerProps> = ({
  variant = 'simple',
  className = '',
  animate = false,
}) => {
  if (variant === 'section') {
    return (
      <div className={`kintsugi-section-divider ${className}`}>
        <div className="kintsugi-section-divider-icon" />
      </div>
    );
  }

  const classMap: Record<string, string> = {
    simple: 'kintsugi-line',
    crack: 'kintsugi-crack',
    shimmer: 'kintsugi-shimmer',
  };

  if (variant === 'crack') {
    return (
      <div className={`${classMap[variant]} ${className}`}>
        <div className={`kintsugi-crack-main ${animate ? 'kintsugi-draw' : ''}`} />
      </div>
    );
  }

  return (
    <div className={`${classMap[variant]} ${className} ${animate ? 'kintsugi-draw' : ''}`} />
  );
};

// Gold shimmer text
export const GoldShimmerText: React.FC<{ text: string; className?: string }> = ({
  text,
  className = '',
}) => (
  <span className={className} style={{
    background: 'linear-gradient(90deg, #b8962e, #d4a843, #f0d080, #d4a843, #b8962e)',
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'goldShimmer 3s ease-in-out infinite',
    fontWeight: 'bold',
  }}>
    {text}
  </span>
);
```

---

## 12.7 Button Design v3 — Washi Paper Button

Every button must feel like pressing a piece of handmade washi paper. The base layer establishes the paper-like foundation.

### Washi Button Base — CSS

```css
/* === WASHI BUTTON BASE === */

.washi-btn {
  /* Geometry */
  position: relative;
  padding: 14px 28px;
  border-radius: 14px;
  border: none;
  cursor: pointer;
  overflow: hidden;

  /* Typography */
  font-family: 'Noto Sans JP', sans-serif;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.04em;

  /* The "Washi Paper" surface */
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.5) 0%,
      transparent 30%,
      transparent 70%,
      rgba(200, 180, 160, 0.1) 100%
    ),
    var(--washi-white, #faf7f2);

  /* Warm paper shadow */
  box-shadow:
    0 1px 1px rgba(255, 255, 255, 0.8) inset,
    0 4px 12px rgba(44, 36, 33, 0.08),
    0 8px 24px rgba(212, 168, 72, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.4) inset;

  /* Organic transitions */
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    background 0.3s ease;

  color: var(--ink-primary, #2c2421);
  user-select: none;
}

/* === HOVER STATE: Paper lifts, corner folds === */
.washi-btn:hover {
  transform: translateY(-3px);
  box-shadow:
    0 1px 2px rgba(255, 255, 255, 0.9) inset,
    0 8px 20px rgba(44, 36, 33, 0.12),
    0 16px 32px rgba(212, 168, 72, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
}

/* Origami folded corner on hover */
.washi-btn::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  background: linear-gradient(
    225deg,
    rgba(212, 90, 90, 0.15) 0%,
    transparent 60%
  );
  border-radius: 0 0 0 14px;
  transition:
    width 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.washi-btn:hover::after {
  width: 32px;
  height: 32px;
}

/* === ACTIVE STATE: Ink press === */
.washi-btn:active {
  transform: translateY(1px) scale(0.98);
  box-shadow:
    0 3px 8px rgba(44, 36, 33, 0.12) inset,
    0 1px 3px rgba(44, 36, 33, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  background:
    linear-gradient(180deg, rgba(200, 180, 160, 0.1) 0%, transparent 50%),
    var(--cream-warm, #f0e6d0);
}
```

### Washi Button Variants

```css
/* === PRIMARY BUTTON (Akane Red) === */
.washi-btn--primary {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, transparent 30%, transparent 70%, rgba(0, 0, 0, 0.08) 100%),
    linear-gradient(135deg, var(--akane-red, #d45a5a) 0%, var(--akane-deep, #b84444) 100%);
  color: white;
  box-shadow:
    0 1px 1px rgba(255, 255, 255, 0.3) inset,
    0 4px 16px rgba(212, 90, 90, 0.25),
    0 8px 24px rgba(212, 90, 90, 0.15);
}

.washi-btn--primary:hover {
  box-shadow:
    0 1px 2px rgba(255, 255, 255, 0.4) inset,
    0 8px 24px rgba(212, 90, 90, 0.35),
    0 16px 40px rgba(212, 90, 90, 0.2);
}

.washi-btn--primary::after {
  background: linear-gradient(225deg, rgba(255, 255, 255, 0.2) 0%, transparent 60%);
}

/* === SECONDARY BUTTON (Matcha Green) === */
.washi-btn--secondary {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, transparent 30%, transparent 70%, rgba(0, 0, 0, 0.08) 100%),
    linear-gradient(135deg, var(--matcha-green, #7a9a6a) 0%, var(--matcha-dark, #5a7a4a) 100%);
  color: white;
  box-shadow:
    0 1px 1px rgba(255, 255, 255, 0.3) inset,
    0 4px 16px rgba(122, 154, 106, 0.25),
    0 8px 24px rgba(122, 154, 106, 0.15);
}

/* === GHOST BUTTON (Glass + Ink) === */
.washi-btn--ghost {
  background: rgba(250, 247, 242, 0.3);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: var(--ink-primary, #2c2421);
  box-shadow:
    0 4px 12px rgba(44, 36, 33, 0.04),
    0 1px 2px rgba(255, 255, 255, 0.6) inset;
}

/* === FAB (Floating Action Button) — Origami Style === */
.washi-fab {
  width: 60px;
  height: 60px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--akane-red, #d45a5a) 0%, var(--akane-deep, #b84444) 100%);
  box-shadow:
    0 4px 16px rgba(212, 90, 90, 0.3),
    0 8px 32px rgba(212, 90, 90, 0.2);
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.washi-fab:hover {
  transform: rotate(45deg) scale(1.1);
  box-shadow:
    0 8px 24px rgba(212, 90, 90, 0.4),
    0 16px 48px rgba(212, 90, 90, 0.25);
}

/* === ICON BUTTON === */
.washi-btn--icon {
  padding: 10px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* === INK RIPPLE EFFECT === */
.ink-ripple {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(44, 36, 33, 0.15) 0%,
    rgba(44, 36, 33, 0.05) 40%,
    transparent 70%
  );
  transform: scale(0);
  animation: ink-spread 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none;
}

@keyframes ink-spread {
  0% { transform: scale(0); opacity: 0.8; }
  50% { opacity: 0.4; }
  100% { transform: scale(4); opacity: 0; }
}

/* For primary buttons, white ink */
.washi-btn--primary .ink-ripple {
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.25) 0%,
    rgba(255, 255, 255, 0.08) 40%,
    transparent 70%
  );
}

/* === BUTTON SIZES === */
.washi-btn--xs   { padding: 8px 14px;  font-size: 12px; border-radius: 10px; }
.washi-btn--sm   { padding: 10px 20px; font-size: 13px; border-radius: 12px; }
.washi-btn--md   { padding: 14px 28px; font-size: 15px; border-radius: 14px; }
.washi-btn--lg   { padding: 18px 36px; font-size: 17px; border-radius: 16px; }
.washi-btn--xl   { padding: 22px 44px; font-size: 19px; border-radius: 18px; }
```

### WashiButton React Component

```tsx
// components/WashiButton.tsx
import React, { useState, useCallback } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'fab' | 'icon';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface WashiButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export const WashiButton: React.FC<WashiButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  className = '',
  disabled = false,
  type = 'button',
}) => {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();

    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);

    onClick?.();
  }, [onClick]);

  const baseClass = `washi-btn`;
  const variantClass = variant === 'fab' ? 'washi-fab' : `washi-btn--${variant}`;
  const sizeClass = variant !== 'fab' && variant !== 'icon' ? `washi-btn--${size}` : '';

  return (
    <button
      type={type}
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
      onClick={handleClick}
      disabled={disabled}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {children}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="ink-ripple"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
          }}
        />
      ))}
    </button>
  );
};
```

---

## 12.8 Tab Transition — Windmill Fix (Enhanced)

Enhanced WindmillTransition with 4 colored blades representing the four seasons of Japan.

### WindmillTransition Component

```tsx
// components/WindmillTransition.tsx
import { motion, AnimatePresence } from 'framer-motion';

interface WindmillTransitionProps {
  children: React.ReactNode;
  isActive: boolean;
  direction?: number; // 1 or -1 for spin direction
}

const BLADE_COLORS = [
  'rgba(212, 90, 90, 0.08)',    // Akane (Spring)
  'rgba(240, 184, 200, 0.08)',  // Sakura (Summer)
  'rgba(122, 154, 106, 0.08)',  // Matcha (Autumn)
  'rgba(212, 168, 72, 0.08)',   // Yamabuki (Winter)
];

export const EnhancedWindmillTransition = ({
  children,
  isActive,
  direction = 1,
}: WindmillTransitionProps) => {
  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="relative"
        >
          {/* Windmill blades overlay */}
          <motion.div
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  width: '200vmax',
                  height: '200vmax',
                  background: `conic-gradient(
                    from ${i * 90}deg,
                    ${BLADE_COLORS[i]} 0deg,
                    ${BLADE_COLORS[i]} 90deg,
                    transparent 90deg
                  )`,
                  clipPath: 'polygon(50% 50%, 50% 0%, 100% 0%)',
                  transformOrigin: '50% 50%',
                }}
                initial={{ rotate: i * 90, scale: 0 }}
                animate={{
                  rotate: i * 90 + direction * 360,
                  scale: [0, 3, 3, 0],
                }}
                transition={{
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1],
                  times: [0, 0.4, 0.6, 1],
                }}
              />
            ))}
          </motion.div>

          {/* Content */}
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
```

### CSS for Windmill Transition

```css
/* === WINDMILL TRANSITION CSS === */

.windmill-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.windmill-blade {
  position: absolute;
  width: 200vmax;
  height: 200vmax;
  transform-origin: 50% 50%;
}

/* Blade colors for the four seasons */
.windmill-blade--spring {
  background: conic-gradient(from 0deg, rgba(212, 90, 90, 0.08) 0deg, rgba(212, 90, 90, 0.08) 90deg, transparent 90deg);
  clip-path: polygon(50% 50%, 50% 0%, 100% 0%);
}

.windmill-blade--summer {
  background: conic-gradient(from 90deg, rgba(240, 184, 200, 0.08) 0deg, rgba(240, 184, 200, 0.08) 90deg, transparent 90deg);
  clip-path: polygon(50% 50%, 50% 0%, 100% 0%);
}

.windmill-blade--autumn {
  background: conic-gradient(from 180deg, rgba(122, 154, 106, 0.08) 0deg, rgba(122, 154, 106, 0.08) 90deg, transparent 90deg);
  clip-path: polygon(50% 50%, 50% 0%, 100% 0%);
}

.windmill-blade--winter {
  background: conic-gradient(from 270deg, rgba(212, 168, 72, 0.08) 0deg, rgba(212, 168, 72, 0.08) 90deg, transparent 90deg);
  clip-path: polygon(50% 50%, 50% 0%, 100% 0%);
}

/* Staggered blade animations */
@keyframes windmillSpin {
  0% { transform: rotate(var(--blade-angle)) scale(0); }
  40% { transform: rotate(calc(var(--blade-angle) + 180deg)) scale(3); }
  60% { transform: rotate(calc(var(--blade-angle) + 270deg)) scale(3); }
  100% { transform: rotate(calc(var(--blade-angle) + 360deg)) scale(0); }
}
```

### Usage Example

```tsx
// In App.tsx or layout component
import { EnhancedWindmillTransition } from './components/WindmillTransition';

// Wrap tab content
<EnhancedWindmillTransition isActive={activeTab === 'dashboard'} direction={1}>
  <DashboardTab />
</EnhancedWindmillTransition>

<EnhancedWindmillTransition isActive={activeTab === 'scan'} direction={-1}>
  <ScanTab />
</EnhancedWindmillTransition>
```

---

## 12.9 Tab Bar — Fixed at Bottom with FloatingDock

FloatingDock configuration for always-visible bottom navigation with z-index fixes.

### FloatingDock Configuration

```tsx
// components/ZenDock.tsx
import React from 'react';
import { motion } from 'framer-motion';

interface DockItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  filledIcon: React.FC<{ className?: string }>;
}

interface ZenDockProps {
  items: DockItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const ZenDock: React.FC<ZenDockProps> = ({
  items,
  activeTab,
  onTabChange,
}) => {
  return (
    <nav
      className="zen-dock"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '8px 16px calc(8px + env(safe-area-inset-bottom))',
        background: 'rgba(255, 253, 248, 0.85)',
        backdropFilter: 'blur(20px) saturate(1.15)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.15)',
        borderTop: '1px solid rgba(232, 220, 200, 0.3)',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        maxWidth: '500px',
        margin: '0 auto',
      }}>
        {items.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = isActive ? item.filledIcon : item.icon;

          return (
            <motion.button
              key={item.id}
              className={`dock-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
              whileTap={{ scale: 0.9 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 16px',
                borderRadius: '16px',
                border: 'none',
                background: isActive ? 'rgba(212, 90, 90, 0.08)' : 'transparent',
                color: isActive ? '#d45a5a' : '#9A8E83',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0, 0, 0.2, 1)',
                position: 'relative',
              }}
            >
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <Icon className="w-6 h-6" />
              </motion.div>

              <span style={{
                fontSize: '10px',
                fontWeight: 500,
                letterSpacing: '0.02em',
                fontFamily: "'Noto Sans JP', sans-serif",
              }}>
                {item.label}
              </span>

              {isActive && (
                <motion.div
                  layoutId="dock-dot"
                  className="dock-dot"
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: '#d45a5a',
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                />
              )}

              {/* Kintsugi crack decoration for active */}
              {isActive && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  style={{
                    position: 'absolute',
                    bottom: '-8px',
                    left: '20%',
                    right: '20%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, #d4a843, transparent)',
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Washi paper texture overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E")`,
        zIndex: -1,
      }} />
    </nav>
  );
};
```

### Z-Index Layer System

```css
/* === Z-INDEX LAYER SYSTEM === */

:root {
  /* Layer definitions to prevent z-index wars */
  --z-background: -10;
  --z-particles: -5;
  --z-base: 0;
  --z-card: 10;
  --z-header: 100;
  --z-modal-backdrop: 200;
  --z-modal: 250;
  --z-toast: 300;
  --z-tab-bar: 9999;       /* Always on top */
  --z-windmill: 50;        /* Tab transition overlay */
  --z-fab: 100;           /* Floating action button */
  --z-dropdown: 150;      /* Dropdown menus */
  --z-tooltip: 160;       /* Tooltips */
}

/* Ensure tab bar is always visible */
.zen-dock {
  z-index: var(--z-tab-bar);
}

/* Windmill transition above content but below tab bar */
.windmill-overlay {
  z-index: var(--z-windmill);
}

/* FAB above content but below tab bar */
.floating-action-btn {
  z-index: var(--z-fab);
}

/* Content padding for fixed tab bar */
.main-content {
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
}
```

### Dock Styling

```css
/* === ZEN DOCK STYLES === */

.zen-dock {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  background: rgba(255, 253, 248, 0.85);
  backdrop-filter: blur(20px) saturate(1.15);
  -webkit-backdrop-filter: blur(20px) saturate(1.15);
  border-top: 1px solid rgba(232, 220, 200, 0.3);
  z-index: 9999;
}

.zen-dock::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: -1;
}

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-radius: 16px;
  border: none;
  background: transparent;
  color: #9A8E83;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0, 0, 0.2, 1);
  position: relative;
}

.dock-item.active {
  background: rgba(212, 90, 90, 0.08);
  color: #d45a5a;
}

.dock-item:active {
  transform: scale(0.92);
}

.dock-dot {
  position: absolute;
  bottom: 4px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #d45a5a;
}

/* Active indicator line */
.dock-item.active::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #d4a843, transparent);
}
```

### Animation Timing Tokens

```css
:root {
  /* === TIMING TOKENS === */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0.2, 1);
  --ease-accelerate: cubic-bezier(0.4, 0, 1, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

  /* Duration tokens */
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --duration-dramatic: 800ms;

  /* Stagger delays */
  --stagger-tight: 50ms;
  --stagger-normal: 100ms;
  --stagger-relaxed: 150ms;
  --stagger-dramatic: 200ms;
}
```

---

## 12.10 Performance Summary

| Effect | Impact | Notes |
|--------|--------|-------|
| Origami (clip-path) | Low | GPU-accelerated in modern browsers |
| Byobu (perspective 3D) | Low-Medium | Limit to 4-6 panels |
| Washi (CSS gradients) | Low | Pure CSS, no images |
| Washi (SVG feTurbulence) | Medium | Use sparingly; prefer CSS-only |
| Patterns (CSS) | Very Low | Pure CSS, most efficient |
| Sumi-e (clip-path + blur) | Low-Medium | Use on key elements only |
| Kintsugi (gradients) | Low | Very safe for repeated use |
| Washi Button | Low | CSS only, no JS overhead |
| Windmill Transition | Medium | Large elements, brief duration |
| FloatingDock | Low | Fixed position, minimal paint |

### Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .windmill-overlay,
  .sakura-petal,
  .bg-red-circle,
  .bg-accent-blob {
    display: none;
  }
}
```


---

# PART 13: IMPLEMENTATION ROADMAP

## Phase 1: Foundation (Days 1-2)
- [ ] Set up Tailwind CSS v4 with custom theme tokens
- [ ] Import Google Fonts (Noto Serif JP, Noto Sans JP, JetBrains Mono)
- [ ] Create GlassCard v2 component
- [ ] Implement base layout (Shell.tsx with header + content area)
- [ ] Create ZenDock v3 component
- [ ] Set up page routing / tab switching
- [ ] Install Tier 1 animation libraries: animejs, @react-spring/web, gsap

## Phase 2: Core UI Components (Days 3-5)
- [ ] Create all component primitives (EmojiCircle, ActionButton, SectionHeader, StatusBadge, CurrencyDisplay)
- [ ] Implement Button states (Ghost, Primary, FAB)
- [ ] Create Input v2 component
- [ ] Build ReceiptCard with category emoji circles
- [ ] Implement Toast v2
- [ ] Create BudgetRing SVG component
- [ ] Implement seasonal theming system
- [ ] Install recommended Magic UI components (Tiers 3-4)

## Phase 3: Screen Implementation (Days 6-10)
- [ ] **Dashboard Tab**: Hero card, budget ring, itinerary card, receipt list, quick actions
- [ ] **Scan Tab**: Camera preview, AI scanning overlay, receipt preview, manual entry form
- [ ] **Timeline Tab**: Day selector, vertical timeline rail, activity cards
- [ ] **History Tab**: Search bar, category filters, receipt list with swipe, sync actions
- [ ] **Weather Tab**: Current weather card, 5-day forecast grid, location selector
- [ ] **Stats Tab**: Category breakdown, daily graph, top expenses
- [ ] **Settings Tab**: Account info, sync controls, people management, data tools

## Phase 4: Animations & Polish (Days 11-13)
- [ ] Implement all 7 Japanese easing curves
- [ ] Add page transitions (Shoji Slide)
- [ ] Implement receipt stagger animations
- [ ] Add number count-up animations
- [ ] Create SakuraBackground canvas component (optional)
- [ ] Implement pull-to-refresh (ink ripple)
- [ ] Add success checkmark animation
- [ ] Header blur on scroll
- [ ] Implement Japanese Art Effects (Part 12):
  - [ ] Origami card components
  - [ ] Byobu tab transitions
  - [ ] Washi paper textures
  - [ ] Japanese pattern backgrounds (Seigaiha, Asanoha)
  - [ ] Sumi-e ink wash reveals
  - [ ] Kintsugi gold dividers
  - [ ] WashiButton v3 with ink ripple
  - [ ] Enhanced WindmillTransition
  - [ ] Fixed bottom FloatingDock

## Phase 5: Background & Ambient (Day 14)
- [ ] Implement layered background architecture
- [ ] Add dot pattern overlay
- [ ] Add light sweep animation
- [ ] Add decorative elements (red circle, glass ribbon)
- [ ] Performance optimization (reduce-motion, will-change, GPU layers)
- [ ] Test all animations at 60fps on mobile

## Phase 6: Free Resources Integration (Ongoing)
- [ ] Install Lenis smooth scroll
- [ ] Install GSAP + ScrollTrigger
- [ ] Install Tabler Icons and/or Phosphor Icons
- [ ] Set up NIPPON COLORS palette variables
- [ ] Apply Japanese pattern backgrounds by screen
- [ ] Explore React Bits components for text animations
- [ ] Explore 21st.dev for dashboard components
- [ ] Install LottieFiles for loading animations

## Component Installation Priority Order

```bash
# Day 1: Core libraries
npm install animejs @react-spring/web gsap @gsap/react

# Day 1: Magic UI Tier 3 (Already installed — verify)
npx shadcn@latest add @magicui/blur-fade
npx shadcn@latest add @magicui/border-beam
npx shadcn@latest add @magicui/canvas-reveal-effect
npx shadcn@latest add @magicui/card-spotlight
npx shadcn@latest add @magicui/file-upload
npx shadcn@latest add @magicui/floating-dock
npx shadcn@latest add @magicui/magic-card
npx shadcn@latest add @magicui/noise
npx shadcn@latest add @magicui/number-ticker
npx shadcn@latest add @magicui/progressive-blur
npx shadcn@latest add @magicui/ripple-button
npx shadcn@latest add @magicui/stateful-button
npx shadcn@latest add @magicui/timeline

# Day 2: Magic UI Tier 4 (P0-P1)
npx shadcn@latest add @magicui/shimmer-button
npx shadcn@latest add @magicui/shimmer-text
npx shadcn@latest add @magicui/magnet-button
npx shadcn@latest add @magicui/particles
npx shadcn@latest add @magicui/confetti
npx shadcn@latest add @magicui/3d-card
npx shadcn@latest add @magicui/tilt-card
npx shadcn@latest add @magicui/tracing-beam
npx shadcn@latest add @magicui/expandable-card
npx shadcn@latest add @magicui/scroll-reveal-card
npx shadcn@latest add @magicui/shiny-card
npx shadcn@latest add @magicui/spotlight-card
npx shadcn@latest add @magicui/lens
npx shadcn@latest add @magicui/multi-step-loader
npx shadcn@latest add @magicui/text-animate
npx shadcn@latest add @magicui/count-up
npx shadcn@latest add @magicui/text-reveal
npx shadcn@latest add @magicui/animated-gradient-text
npx shadcn@latest add @magicui/background-beams
npx shadcn@latest add @magicui/background-gradient
npx shadcn@latest add @magicui/dot-pattern
npx shadcn@latest add @magicui/sparkles-text
npx shadcn@latest add @magicui/meteors
npx shadcn@latest add @magicui/aurora-text
npx shadcn@latest add @magicui/bento-grid
npx shadcn@latest add @magicui/spinner
npx shadcn@latest add @magicui/skeleton

# Day 3-5: Free Resources
npm install lenis
npm install @tabler/icons-react
npm install @phosphor-icons/react
npm install @lottiefiles/react-lottie-player
```

---

# APPENDIX A: Tech Stack & Dependencies

## Core Framework
| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.2.6 | UI framework |
| react-dom | ^19.2.6 | DOM renderer |
| typescript | ^5.8.0 | Type safety |
| vite | ^8.0.11 | Build tool |
| @vitejs/plugin-react | ^6.0.1 | React plugin |

## Styling
| Package | Version | Purpose |
|---------|---------|---------|
| tailwindcss | ^4.2.4 | Utility CSS |
| @tailwindcss/vite | ^4.2.4 | Tailwind Vite integration |
| tailwind-merge | ^3.5.0 | Merge Tailwind classes |
| clsx | ^2.1.1 | Conditional classes |
| class-variance-authority | ^0.7.1 | Component variants |

## shadcn/ui Primitives
| Package | Version | Purpose |
|---------|---------|---------|
| @radix-ui/react-dialog | ^1.1.1 | Modal/dialog |
| @radix-ui/react-dropdown-menu | ^1.1.1 | Dropdown menus |
| @radix-ui/react-slot | ^1.1.0 | Polymorphic components |

## Animation Libraries
| Package | Version | Purpose |
|---------|---------|---------|
| motion | ^12.38.0 | Layout animations, gestures, AnimatePresence |
| animejs | ^4.4.1 | Complex animation sequences |
| @react-spring/web | ^9.7.5 | Physics-based spring animations |
| gsap | ^3.12.7 | Professional timeline animations |
| @gsap/react | ^2.1.1 | GSAP React integration |
| lenis | ^1.1.18 | Smooth scroll |
| canvas-confetti | ^1.9.3 | Celebration effects |

## Icons
| Package | Version | Purpose |
|---------|---------|---------|
| lucide-react | ^1.14.0 | Primary icon library (1,400+ icons) |
| @tabler/icons-react | latest | Secondary icons (4,500+ icons) |
| @phosphor-icons/react | latest | Flexible weight icons (7,000+ icons) |

## Free Component Libraries (Copy-paste / One-command)
| Resource | Count | Install |
|----------|-------|---------|
| Magic UI (shadcn registry) | 75+ components | `npx shadcn add @magicui/{name}` |
| React Bits | 150+ components | Copy-paste / `npx shadcn add "https://reactbits.dev/..."` |
| 21st.dev | 600+ components | `npx shadcn add "https://21st.dev/r/USER/COMPONENT"` |
| HyperUI | 200+ components | Copy-paste HTML + Tailwind |

## Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| @playwright/test | ^1.59.1 | E2E testing |
| @types/react | ^19.2.14 | React types |
| @types/react-dom | ^19.2.3 | React DOM types |
| @types/canvas-confetti | ^1.6.4 | Confetti types |

---

# APPENDIX B: Animation Easing Quick Reference

| Token | Curve | Usage |
|-------|-------|-------|
| ease-ma | `cubic-bezier(0.25,0.1,0.25,1)` | Page transitions, modals |
| ease-wa | `cubic-bezier(0,0,0.2,1)` | Card hovers, button states |
| ease-kaze | `cubic-bezier(0.32,0.72,0.56,1)` | Dropdowns, toasts |
| ease-hana | `cubic-bezier(0.68,-0.15,0.265,1.35)` | Bouncy entrances |
| ease-sumi | `cubic-bezier(0.4,0,0.6,1)` | Number reveals, loading |
| ease-ka | `cubic-bezier(0.16,1,0.3,1)` | Toggles, instant feedback |
| ease-ki | `cubic-bezier(0.34,1.56,0.64,1)` | List item entrances |

---

# APPENDIX C: Responsive Breakpoints

| Name | Width | Description |
|------|-------|-------------|
| xs | 320px | Minimum supported width |
| sm | 375px | Primary target (iPhone) |
| md | 428px | Large phones |
| lg | 768px | Tablets (side-by-side if needed) |
| xl | 1024px | Desktop (centered content) |

---

# APPENDIX D: Complete File Inventory

## Components to Create

| Component | File | Priority | Part |
|-----------|------|----------|------|
| GlassCard | `components/ui/GlassCard.tsx` | P0 | Part 4 |
| EmojiCircle | `components/ui/EmojiCircle.tsx` | P0 | Part 4 |
| ActionButton | `components/ui/ActionButton.tsx` | P0 | Part 4 |
| SectionHeader | `components/ui/SectionHeader.tsx` | P0 | Part 4 |
| StatusBadge | `components/ui/StatusBadge.tsx` | P0 | Part 4 |
| CurrencyDisplay | `components/ui/CurrencyDisplay.tsx` | P0 | Part 4 |
| ButtonGhost | `components/ui/ButtonGhost.tsx` | P0 | Part 5 |
| ButtonPrimary | `components/ui/ButtonPrimary.tsx` | P0 | Part 5 |
| ButtonIcon | `components/ui/ButtonIcon.tsx` | P0 | Part 5 |
| InputV2 | `components/ui/InputV2.tsx` | P0 | Part 5 |
| ReceiptCard | `components/ui/ReceiptCard.tsx` | P0 | Part 5 |
| ZenDock | `components/ui/ZenDock.tsx` | P0 | Part 5 |
| BudgetRing | `components/ui/BudgetRing.tsx` | P1 | Part 5 |
| ToastV2 | `components/ui/ToastV2.tsx` | P1 | Part 5 |
| SakuraBackground | `components/effects/SakuraBackground.tsx` | P2 | Part 6 |
| ShojiTransition | `components/effects/ShojiTransition.tsx` | P1 | Part 6 |
| InkReveal | `components/effects/InkReveal.tsx` | P1 | Part 6 |
| SeasonalTheme | `lib/seasonal.ts` | P1 | Part 9 |
| BackgroundLayer | `components/effects/BackgroundLayer.tsx` | P0 | Part 8 |
| LightSweep | `components/effects/LightSweep.tsx` | P1 | Part 8 |
| OrigamiCard | `components/japanese/OrigamiCard.tsx` | P1 | Part 12 |
| ReceiptOrigami | `components/japanese/ReceiptCard.tsx` | P1 | Part 12 |
| UnfoldWrapper | `components/japanese/UnfoldWrapper.tsx` | P1 | Part 12 |
| Byobu | `components/japanese/Byobu.tsx` | P2 | Part 12 |
| ByobuTabs | `components/japanese/ByobuTabs.tsx` | P2 | Part 12 |
| WashiPaper | `components/japanese/WashiPaper.tsx` | P0 | Part 12 |
| WashiFilterDefs | `components/japanese/WashiFilterDefs.tsx` | P1 | Part 12 |
| InkOnWashi | `components/japanese/InkOnWashi.tsx` | P2 | Part 12 |
| WashiBackground | `components/japanese/WashiBackground.tsx` | P0 | Part 12 |
| WagaraPattern | `components/japanese/WagaraPattern.tsx` | P1 | Part 12 |
| SumiNumber | `components/japanese/SumiNumber.tsx` | P1 | Part 12 |
| KintsugiDivider | `components/japanese/KintsugiDivider.tsx` | P0 | Part 12 |
| GoldShimmerText | `components/japanese/GoldShimmerText.tsx` | P1 | Part 12 |
| WashiButton | `components/japanese/WashiButton.tsx` | P0 | Part 12 |
| EnhancedWindmillTransition | `components/effects/WindmillTransition.tsx` | P1 | Part 12 |
| ZenDock (Fixed Bottom) | `components/ui/ZenDock.tsx` | P0 | Part 12 |

---

# APPENDIX E: Japanese Color Reference

| Japanese Name | Hex | English Name |
|---------------|-----|--------------|
| Shironeri | `#f8f4e6` | Off-white (paper) |
| Kincha | `#c18a26` | Gold/ochre |
| Azuki | `#672529` | Deep red |
| Sumi | `#1a1a1a` | Ink black |
| Sora | `#4a7ab5` | Sky blue |
| Fuji | `#9b7cb9` | Purple |
| Sakura | `#ffc0cb` | Cherry blossom |
| Momo | `#e08da6` | Pink |
| Wakakusa | `#c8d85c` | Yellow-green |
| Moegi | `#5b8c5a` | Green |
| Kintsugi Gold | `#d4a843` | Gold (kintsugi) |
| Hai | `#95959c` | Ash grey |
| Kurotsurubami | `#181614` | Black-brown |
| Gofun | `#fffff4` | Shell white |
| Byakugun | `#dde5ec` | Light grey-blue |

---

# APPENDIX F: Complete Magic UI Component List (Quick Reference)

```
# Already Installed (12 components)
@magicui/blur-fade          @magicui/border-beam         @magicui/canvas-reveal-effect
@magicui/card-spotlight      @magicui/file-upload         @magicui/floating-dock
@magicui/magic-card          @magicui/noise               @magicui/number-ticker
@magicui/progressive-blur    @magicui/ripple-button       @magicui/stateful-button
@magicui/timeline

# Recommended P0-P1 (25 components)
@magicui/shimmer-button      @magicui/magnet-button       @magicui/confetti
@magicui/3d-card             @magicui/tilt-card           @magicui/tracing-beam
@magicui/expandable-card     @magicui/scroll-reveal-card  @magicui/shiny-card
@magicui/spotlight-card      @magicui/lens                @magicui/multi-step-loader
@magicui/text-animate        @magicui/count-up             @magicui/text-reveal
@magicui/animated-gradient-text  @magicui/background-beams   @magicui/background-gradient
@magicui/dot-pattern         @magicui/sparkles-text        @magicui/meteors
@magicui/aurora-text         @magicui/bento-grid           @magicui/spinner
@magicui/skeleton            @magicui/shimmer-text

# Optional P2-P3 (30+ components)
@magicui/animated-subscribe-button  @magicui/interactive-hover-button  @magicui/star-button
@magicui/loop-text          @magicui/spinning-text        @magicui/code-comparison
@magicui/morphing-text      @magicui/text-rotate          @magicui/text-reveal-by-word
@magicui/slot-machine-text  @magicui/spinning-text-circle @magicui/typing-animation
@magicui/animated-beam      @magicui/animated-beam-multiple  @magicui/background-boxes
@magicui/background-lines   @magicui/flickering-grid      @magicui/neon-gradient-card
@magicui/waves-background   @magicui/interactive-grid-pattern  @magicui/grid-pattern
@magicui/hover-border-gradient-card  @magicui/flip-card     @magicui/glowing-card
@magicui/card-3d            @magicui/direction-aware-hover  @magicui/focus-cards
@magicui/magnified-dock     @magicui/parallax-scroll      @magicui/safari-browser
@magicui/terminal           @magicui/scroll-progress      @magicui/aurora-background
```

---

# APPENDIX G: Accessibility Checklist

- [ ] All interactive elements have minimum 44x44px touch targets
- [ ] Color contrast ratios meet WCAG 2.1 AA (4.5:1 for text)
- [ ] `prefers-reduced-motion` respected for all animations
- [ ] Screen reader labels on all icon-only buttons
- [ ] Focus states visible on all interactive elements
- [ ] Tab order is logical and follows visual order
- [ ] Error states have both visual and textual indicators
- [ ] Loading states announced to screen readers
- [ ] Decorative elements have `aria-hidden="true"`
- [ ] All form inputs have associated labels

---

# Document Change Log

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | Initial | Original blueprint |
| v2.0 | 2024 | Ultra-fancy design system integration |
| v3.0 | 2026-05-09 | Complete rewrite of Parts 10, 11, 12; Added Magic UI 75+ component catalog, free resources, Japanese art effects, WashiButton v3, EnhancedWindmillTransition, fixed bottom FloatingDock |

---

*Document ends. Total ~4,000 lines. This is the PRIMARY design reference for implementation.*

