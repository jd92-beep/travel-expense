# AI Agent Quick Guide — Travel Expense App v4 (Ultra-Fancy Edition)

## Project Context

```
Repo:     jd92-beep/travel-expense (app-react/ only)
Tech:     React 19 + TypeScript 5.8 + Tailwind CSS v4 + Vite 8 + Motion
Design:   奶油日式和風 (Cream Japanese Style) + Origami + Byobu + Washi
Colors:   bg #F5EAD8, primary #D94132 (Akane 茜), accent #D39A29 (Kohaku 琥珀)
Fonts:    Noto Serif JP (headings), Noto Sans JP (body), JetBrains Mono (numbers)
Database: Notion via Credential Broker (Cloudflare Worker)
```

## What's New in v4

| Feature | Status |
|---------|--------|
| Notion Sync Bug Fixes (6 bugs) | ✅ useSyncEngine.ts |
| Magic UI Components (12 installed) | ✅ blur-fade, magic-card, number-ticker, etc. |
| Japanese Art Effects (7 types) | 🆕 Origami, Byobu, Washi, Seigaiha, Sumi-e, Kintsugi, Sakura |
| Fancy Buttons (Washi Paper) | 🆕 Origami fold corners, ink ripple, paper press |
| Windmill Tab Transition | 🆕 Enhanced 4-blade spinning |
| Fixed Bottom Tab Bar | 🆕 FloatingDock always visible |
| Text Animations | 🆕 text-animate, aurora-text, hyper-text |
| Background Effects | 🆕 Particles, noise texture, aurora gradients |
| Card Effects | 🆕 shine-border, glare-hover, magic-card |
| Playful Elements | 🆕 Confetti, emoji bounce, wobble animations |

## Quick Start — What to Install NOW

```bash
cd travel-expense/app-react

# === FIX: TypeScript version ===
sed -i '' 's/"typescript": "\^6.0.3"/"typescript": "^5.8.0"/' package.json

# === P0: Must-install Magic UI components ===
npx shadcn@latest add @magicui/text-animate
npx shadcn@latest add @magicui/animated-circular-progress-bar
npx shadcn@latest add @magicui/confetti
npx shadcn@latest add @magicui/bento-grid
npx shadcn@latest add @magicui/shimmer-button
npx shadcn@latest add @magicui/pulsating-button
npx shadcn@latest add @magicui/particles

# === P1: High-value effects ===
npx shadcn@latest add @magicui/aurora-text
npx shadcn@latest add @magicui/hyper-text
npx shadcn@latest add @magicui/shine-border
npx shadcn@latest add @magicui/glare-hover
npx shadcn@latest add @magicui/sparkles-text
npx shadcn@latest add @magicui/animated-gradient-text

# === P2: Polish effects ===
npx shadcn@latest add @magicui/retro-grid
npx shadcn@latest add @magicui/meteors
npx shadcn@latest add @magicui/marquee

# === New libraries ===
npm install lenis gsap @gsap/react

# === Google Fonts (add to index.html) ===
# <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Serif+JP:wght@400;600;700&display=swap" rel="stylesheet">
```

## Component → Screen Mapping

| Component | Library | Install | Screen | Purpose |
|-----------|---------|---------|--------|---------|
| text-animate | MagicUI | `npx shadcn add @magicui/text-animate` | All | Section header animations |
| animated-circular-progress-bar | MagicUI | `npx shadcn add @magicui/animated-circular-progress-bar` | Dashboard | Budget ring |
| confetti | MagicUI | `npx shadcn add @magicui/confetti` | Dashboard/Scan | Celebrations |
| bento-grid | MagicUI | `npx shadcn add @magicui/bento-grid` | Dashboard | Metrics layout |
| shimmer-button | MagicUI | `npx shadcn add @magicui/shimmer-button` | Dashboard/Scan | Primary CTAs |
| pulsating-button | MagicUI | `npx shadcn add @magicui/pulsating-button` | Scan | Capture button |
| particles | MagicUI | `npx shadcn add @magicui/particles` | Dashboard/Stats | Background |
| aurora-text | MagicUI | `npx shadcn add @magicui/aurora-text` | Dashboard | Hero title |
| hyper-text | MagicUI | `npx shadcn add @magicui/hyper-text` | Dashboard/Stats | Number scramble |
| shine-border | MagicUI | `npx shadcn add @magicui/shine-border` | Dashboard | Featured card border |
| glare-hover | MagicUI | `npx shadcn add @magicui/glare-hover` | History/Stats | Card hover effect |
| sparkles-text | MagicUI | `npx shadcn add @magicui/sparkles-text` | Dashboard | Highlight text |
| animated-gradient-text | MagicUI | `npx shadcn add @magicui/animated-gradient-text` | Stats | Gradient titles |
| retro-grid | MagicUI | `npx shadcn add @magicui/retro-grid` | Stats | Background grid |
| meteors | MagicUI | `npx shadcn add @magicui/meteors` | Weather | Night effect |
| marquee | MagicUI | `npx shadcn add @magicui/marquee` | Settings | Ticker |

## Already Installed (Don't Reinstall)

✅ blur-fade, border-beam, magic-card, number-ticker, ripple-button, canvas-reveal-effect, card-spotlight, floating-dock, file-upload, noise-texture, progressive-blur, stateful-button, timeline

## Prompt Templates (Copy-Paste)

### Install Component
```
幫我安裝 @magicui/text-animate 並加到 tabs/Dashboard.tsx。
奶油風格配色：bg #F5EAD8，accent #D94132 (Akane)。
TypeScript + React 19 + Tailwind CSS v4。
確保支援 prefers-reduced-motion。
```

### Add Japanese Art Effect
```
幫我加摺紙效果 (origami folded corner) 去 receipt cards。
用 CSS clip-path 同 ::before pseudo-element。
參考 docs/BLUEPRINT.md Part 12 嘅 origami CSS。
確保 hover 時 corner fold 出嚟。
```

### Fix Tab Bar
```
確保 FloatingDock 喺底部固定，唔會滾動走。
position: fixed; bottom: 0; z-index: 9999;
加 safe-area-inset-bottom padding。
參考 docs/implementation_guide.md Step 2。
```

### Windmill Transition
```
增強 WindmillTransition 效果，令 tab switch 時有 4 塊 blade 旋轉。
用 conic-gradient 同 spring animation。
參考 docs/implementation_guide.md Step 3。
```

### Full Context (Start New Chat)
```
你係 React frontend 開發者。Repo: jd92-beep/travel-expense (app-react/)。
Tech: React 19 + TS 5.8 + Tailwind v4 + Vite 8 + Motion。
設計：奶油風格 + 日式和風 + 摺紙藝術 + 屏風效果。
顏色：bg #F5EAD8，primary #D94132 (Akane 茜)，accent #D39A29。
字體：Noto Serif JP (標題), Noto Sans JP (正文), JetBrains Mono (數字)。
Button: Washi paper feel, origami fold corners, ink ripple effect。
Tab: FloatingDock fixed bottom + windmill spinning transition。
背景：Particles + noise texture + aurora gradients。
Notion Sync: useSyncEngine hook (已經有 conflict resolution)。
參考 docs/BLUEPRINT.md (Part 10-12) 同 docs/implementation_guide.md。
安裝組件用：npx shadcn@latest add @magicui/[name]。
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/BLUEPRINT.md` | Complete design system (4,268 lines) |
| `docs/implementation_guide.md` | Step-by-step implementation (1,215 lines) |
| `docs/ai_agent_guide.md` | This file — quick reference |
| `src/components/ui/magicui/` | Magic UI components (auto-generated) |
| `src/components/ui/` | shadcn components (auto-generated) |

## Color Token Cheat Sheet

| Token | Hex | Usage |
|-------|-----|-------|
| Cream-200 | #F5EAD8 | Page background |
| Akane-500 | #D94132 | Primary buttons |
| Sakura-300 | #FFB3C5 | Spring accent |
| Matcha-400 | #82B55E | Success |
| Ruri-500 | #4A6FA5 | Info/links |
| Kuchiba-400 | #C4956A | Warning |
| Kohaku-500 | #D39A29 | Gold accent |
| Text Primary | #2D2926 | Body text |
| Glass BG | rgba(255,253,248,0.72) | Card backgrounds |
