# Travel Expense App — Japanese Style (和風) Fancy UI Implementation Guide

> **Target codebase**: `app-react/` directory  
> **Tech stack**: React 19 + TypeScript 5.8 + Tailwind CSS v4 + Vite 8 + Motion  
> **Theme**: Japanese (和風) — Origami, Byobu, Washi paper, cream palette  
> **Goal**: Make the UI fancy with Magic UI components, wasabi-paper buttons, windmill transitions, fixed bottom tab bar, and playful micro-interactions.

---

<!-- LATEST v2026-05-13 -->
## Phase 0: Bug Fixes (Latest)

> Apply these BEFORE proceeding to Step 1.

---

### Step 0.1: WindmillTransition — Still Too Large

**File:** `src/components/WindmillTransition.tsx`

**Problem:** Even with `150vmax`, the conic-gradient overlay + 4-layer HyperframeBackground + NoiseTexture = GPU overload on mobile Chrome during tab switch.

**Fix 1a — Reduce to 100vmax:**
```tsx
style={{
  width: '100vmax',      // ← 150 → 100
  height: '100vmax',
  marginLeft: '-50vmax',
  marginTop: '-50vmax',
  // keep contain: 'paint'
}}
```

**Fix 1b — Consider replacing with React 19 <ViewTransition> (0 KB bundle):**
```tsx
import { ViewTransition, startTransition } from 'react';

const changeTab = (next: TabId) => {
  startTransition(() => setTab(next));
};

<ViewTransition name="tab-content">
  <TabContent />
</ViewTransition>
```

### Step 0.2: HyperframeBackground — Mounts 4 Layers Unconditionally

**File:** `src/components/HyperframeBackground.tsx`

**Problem:** All 4 layers mount into DOM even on mobile. CSS hides 2 via `display: none`, but React still creates DOM nodes and GPU layers.

**Fix — Add React-conditional rendering:**
```tsx
import { useMemo } from 'react';

function isMobile() {
  return typeof window !== 'undefined' && 
    window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

export function HyperframeBackground() {
  const mobile = useMemo(() => isMobile(), []);
  const layers = mobile 
    ? [LAYER_BASE, LAYER_SUN]     // Only 2 on mobile
    : [LAYER_BASE, LAYER_SUN, LAYER_ROUTE, LAYER_PAPER]; // All 4 on desktop
  // ...
}
```

### Step 0.3: liquid-glass blur(32px) — No Mobile Override

**File:** `src/styles/glass.css`

**Problem:** `blur(32px)` is expensive on mobile GPU. No media query override.

**Fix:**
```css
@media (max-width: 768px) {
  .liquid-glass-enhanced {
    backdrop-filter: blur(16px) saturate(1.25);
    -webkit-backdrop-filter: blur(16px) saturate(1.25);
  }
}
```

### Step 0.4: content-visibility — Missing

**File:** `src/styles.css`

**Problem:** Off-screen glass cards are fully rendered even when not visible.

**Fix:**
```css
@media (max-width: 768px) {
  .glass-card {
    content-visibility: auto;
    contain-intrinsic-size: 0 80px;
  }
}
```

### Step 0.5: Camera/Gallery — inputKey Timing Bug

**File:** `src/tabs/Scan.tsx`

**Problem:** `inputKey` increments AFTER `handleImage()` completes (in finally block). If user cancels picker, onChange never fires → inputKey never changes → stale input reused.

**Fix — Move inputKey increment BEFORE .click():**
```tsx
const triggerCamera = useCallback(() => {
  setMode('scan');
  setInputKey((k) => k + 1);  // ← Before .click()
  if (busy !== 'ocr') {
    Promise.resolve().then(() => cameraRef.current?.click());
  }
}, [busy]);
// Remove the setTimeout(100ms) inputKey increment from finally block
```

### Step 0.6: Remove Unused Imports in Dashboard.tsx

**File:** `src/tabs/Dashboard.tsx`

**Problem:** `AnimatedCircularProgressBar` and `BorderBeam` imported but never used.

**Fix:** Remove these two imports.
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '150vmax',      // ← reduced from 200vmax
          height: '150vmax',
          marginLeft: '-75vmax',
          marginTop: '-75vmax',
          pointerEvents: 'none',
          zIndex: 40,
          contain: 'paint',      // FIX 5: contain:paint isolates rendering
          willChange: 'transform, opacity',
          background: `
            conic-gradient(
              from 0deg,
              transparent 0deg,
              rgba(194, 59, 94, 0.06) 30deg,
              transparent 60deg,
              rgba(30, 77, 107, 0.06) 90deg,
              transparent 120deg,
              rgba(212, 168, 67, 0.06) 150deg,
              transparent 180deg,
              rgba(194, 59, 94, 0.06) 210deg,
              transparent 240deg,
              rgba(30, 77, 107, 0.06) 270deg,
              transparent 300deg,
              rgba(212, 168, 67, 0.06) 330deg,
              transparent 360deg
            )
          `,
        }}
      />
    </AnimatePresence>
  );
}
```

**Key changes summary:**

| Item | Before | After | Effect |
|------|--------|-------|--------|
| Size | 200vmax | 150vmax | 44% less GPU load |
| Color stops | 16 | 12 | 25% less gradient compute |
| Duration | 0.55s | 0.45s | Faster completion, less flash window |
| `contain: paint` | none | added | Isolates render, prevents repaint spread |

---

### Step 0.2: Update styles.css for Mobile Backdrop-Filter

**File:** `src/styles.css` (glass-card section)

**Before:**
```css
.glass-card {
  backdrop-filter: blur(32px) saturate(1.45);
  -webkit-backdrop-filter: blur(32px) saturate(1.45);
}
```

**After:**
```css
.glass-card {
  backdrop-filter: blur(20px) saturate(1.25);
  -webkit-backdrop-filter: blur(20px) saturate(1.25);
}

/* Mobile: further reduce */
@media (max-width: 768px) {
  .glass-card {
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
  }

  /* Remove hover effects on touch devices */
  .glass-card:hover {
    transform: none;
    box-shadow: var(--shadow-soft);
  }
}
```

---

### Step 0.3: Update styles.css for Hyperframe Layers

**File:** `src/styles.css`

**Add this mobile media query** (hide 2 of 4 hyperframe layers on mobile):

```css
@media (max-width: 768px) {
  .hyperframe-layer--route,
  .hyperframe-layer--paper {
    display: none; /* Hide lighter layers on mobile */
  }

  .hyperframe-layer {
    animation-duration: 30s; /* Slow down animation */
  }
}
```

**Also add GPU acceleration hints** (append to existing `@layer base` or global CSS):

```css
/* Prevent mobile flashing */
@layer base {
  .windmill-transition,
  .hyperframe-layer,
  .glass-card {
    transform: translateZ(0); /* Force GPU layer */
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  @media (max-width: 768px) {
    .hyperframe-background {
      opacity: 0.6; /* Reduce overall opacity */
    }

    body::after {
      animation: travel-light-sweep 25s ease-in-out infinite alternate;
      opacity: 0.12;
    }
  }
}
```

---

### Step 0.4: Fix main.tsx StrictMode

**File:** `src/main.tsx`

**Before:**
```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**After:**
```tsx
const root = ReactDOM.createRoot(document.getElementById('root')!);

if (import.meta.env.DEV) {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  root.render(<App />);
}
```

> ⚠️ **Keep StrictMode in DEV** to catch side effects. Remove only in production builds.

---

### Step 0.5: Fix Scan.tsx Input Handling

**File:** `src/tabs/Scan.tsx`

**Problem:** File input `onChange` does not fire on second attempt because:
1. `input.value` is cleared programmatically after first use
2. Mobile Chrome sees the same file path → skips `onChange` dispatch
3. React SyntheticEvent + label click race condition causes re-render during file picker

**Changes needed:**

#### 5a. Add `inputKey` state to force rebuild after each use:

```tsx
// Add near top of Scan() component:
const [inputKey, setInputKey] = useState(0);
```

#### 5b. Update `handleImage` to force input rebuild in `finally`:

```tsx
async function handleImage(file?: File, retry = false) {
  if (!file) {
    setStatus('未收到圖片。相機無彈出時，請試相簿或手動記一筆。');
    return;
  }
  if (file.size > 5_000_000) {
    setStatus('圖片太大（超過 5MB），請先壓縮。');
    return;
  }
  if (!retry) setLastScanFile(file);
  setBusy('ocr');
  setStatus('讀取收據圖片…');
  try {
    const receipt = await scanReceiptImage(file, state);
    openDraft(receipt);
    setStatus('OCR 完成，請確認欄位。');
  } catch (error) {
    const draft = {
      ...heuristicReceiptFromText(file.name, state),
      store: safeFileStem(file),
      note: `OCR 未完成：${error instanceof Error ? error.message : String(error)}`,
      source: 'react-ocr-manual',
    };
    openDraft(draft);
    setStatus('未能自動 OCR，已開啟 React 確認表俾你手動補資料。');
  } finally {
    setBusy('');
    // FIX: Delay then force rebuild input element
    setTimeout(() => {
      setInputKey((k) => k + 1); // ← forces re-mount of <input>
    }, 100);
  }
}
```

#### 5c. Use `useCallback` for stable onChange handlers:

```tsx
const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    const file = files[0];
    setTimeout(() => handleImage(file), 0); // Defer to ensure event is fully processed
  }
}, [state]);

const handleGalleryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    const file = files[0];
    setTimeout(() => handleImage(file), 0);
  }
}, [state]);
```

#### 5d. Add `key` prop to each input to enable forced rebuild:

```tsx
{/* Camera input */}
<input
  key={`camera-${inputKey}`}
  id={CAMERA_INPUT_ID}
  className="visually-hidden-file"
  type="file"
  accept="image/*"
  capture="environment"
  onChange={handleCameraChange}
/>

{/* Gallery input */}
<input
  key={`gallery-${inputKey}`}
  id={GALLERY_INPUT_ID}
  className="visually-hidden-file"
  type="file"
  accept="image/*"
  onChange={handleGalleryChange}
/>

{/* Email image input */}
<input
  key={`email-${inputKey}`}
  id={EMAIL_IMAGE_INPUT_ID}
  className="visually-hidden-file"
  type="file"
  accept="image/*"
  multiple
  onChange={(e) => handleEmailImages(e.target.files)}
/>
```

#### 5e. Use `requestAnimationFrame` for manual trigger (optional but recommended):

```tsx
const triggerCamera = useCallback(() => {
  setMode('scan');
  requestAnimationFrame(() => {
    const input = document.getElementById(CAMERA_INPUT_ID) as HTMLInputElement;
    if (input && busy !== 'ocr') {
      input.click();
    }
  });
}, [busy]);

const triggerGallery = useCallback(() => {
  setMode('scan');
  requestAnimationFrame(() => {
    const input = document.getElementById(GALLERY_INPUT_ID) as HTMLInputElement;
    if (input && busy !== 'ocr') {
      input.click();
    }
  });
}, [busy]);
```

Then replace `<label>` buttons with `<button>` elements:

```tsx
<button type="button" disabled={busy === 'ocr'} onClick={triggerCamera}>
  <Camera size={26} className="text-blue-600" />
  <span>相機</span>
</button>

<button type="button" disabled={busy === 'ocr'} onClick={triggerGallery}>
  <FileImage size={26} className="text-purple-600" />
  <span>相簿</span>
</button>
```

---

### Step 0.6: Add visually-hidden-file CSS

**File:** `src/styles.css`

**Add this if not already present:**

```css
/* Must use this pattern — never display:none or visibility:hidden */
.visually-hidden-file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

> ⚠️ Using `display: none` or `visibility: hidden` will break label triggering on mobile.

---

### Bug Fix Testing Checklist

#### Bug 1 (Flashing)
- [ ] Open app on Android Chrome
- [ ] Rapidly switch tabs 5+ times
- [ ] Observe no flashing/white-screen
- [ ] Check GPU usage (Chrome DevTools → Performance)

#### Bug 2 (Camera/Gallery)
- [ ] Tap Camera → take photo → confirm OCR
- [ ] Tap Camera again → take photo → confirm second attempt works
- [ ] Repeat 5 times
- [ ] Same test for Gallery
- [ ] Test selecting the same photo twice
- [ ] Test selecting different photos

<!-- END ADDED v2026-05-13 -->

---

## Step 1: Install Components & Libraries

### 1.1 Install P0 Magic UI Components (Must Have)

Run these in order inside `app-react/`:

```bash
cd app-react

# P0 — Must install first
npx shadcn@latest add @magicui/text-animate
npx shadcn@latest add @magicui/animated-circular-progress-bar
npx shadcn@latest add @magicui/confetti
npx shadcn@latest add @magicui/bento-grid
npx shadcn@latest add @magicui/shimmer-button
npx shadcn@latest add @magicui/pulsating-button
npx shadcn@latest add @magicui/particles
```

### 1.2 Install P1 Magic UI Components (High Value)

```bash
# P1 — High value polish
npx shadcn@latest add @magicui/aurora-text
npx shadcn@latest add @magicui/hyper-text
npx shadcn@latest add @magicui/shine-border
npx shadcn@latest add @magicui/glare-hover
npx shadcn@latest add @magicui/sparkles-text
npx shadcn@latest add @magicui/animated-gradient-text
```

### 1.3 Install P2 Magic UI Components (Polish)

```bash
# P2 — Nice to have
npx shadcn@latest add @magicui/retro-grid
npx shadcn@latest add @magicui/meteors
npx shadcn@latest add @magicui/marquee
```

### 1.4 Install Animation Libraries

```bash
npm install lenis gsap @gsap/react
```

### 1.5 Verify Installations

After installation, confirm these files exist:

```bash
ls src/components/ui/text-animate.tsx
ls src/components/ui/animated-circular-progress-bar.tsx
ls src/components/ui/confetti.tsx
ls src/components/ui/bento-grid.tsx
ls src/components/ui/shimmer-button.tsx
ls src/components/ui/pulsating-button.tsx
ls src/components/ui/particles.tsx
ls src/components/ui/aurora-text.tsx
ls src/components/ui/hyper-text.tsx
ls src/components/ui/shine-border.tsx
ls src/components/ui/glare-hover.tsx
ls src/components/ui/sparkles-text.tsx
ls src/components/ui/animated-gradient-text.tsx
```

---

## Step 2: Fix Tab Bar — Fixed Bottom FloatingDock

### Problem
The current `FloatingDock` in `Shell.tsx` scrolls with content. It must stay fixed at the bottom of the viewport.

### File: `src/components/Shell.tsx`

**Current**: `FloatingDock` is placed inside the flow at the bottom of `<div className="app-shell">`.

**Change**: Wrap `FloatingDock` in a fixed-position container.

```tsx
// === AFTER ===
// In the return statement of Shell(), replace the FloatingDock usage:

      <main className="content">{children}</main>
      <WindmillTransition activeKey={active} />

      {/* Fixed bottom tab bar — never scrolls away */}
      <div className="fixed-tab-bar">
        <FloatingDock
          desktopClassName="app-floating-dock-desktop"
          mobileClassName="app-floating-dock-mobile"
          items={TAB_MANIFEST.map((tab) => ({
            title: tab.label,
            icon: icons[tab.id],
            active: active === tab.id,
            onSelect: () => onTab(tab.id),
          }))}
        />
      </div>
```

### File: `src/styles.css`

Add this CSS block near the top (after the `@import` lines):

```css
/* ========== FIXED BOTTOM TAB BAR ========== */
.fixed-tab-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  width: 100%;
  max-width: 820px;
  padding: 0 16px max(12px, env(safe-area-inset-bottom)) 16px;
  pointer-events: none; /* Let clicks pass through around the dock */
}
.fixed-tab-bar > * {
  pointer-events: auto; /* Re-enable clicks on the dock itself */
}

/* Adjust app-shell bottom padding to account for fixed tab bar */
.app-shell {
  padding-bottom: 120px; /* Was 112px — give room for fixed dock */
}
.content {
  padding-bottom: 16px; /* Reduced from 112px since dock is now fixed */
}
```

---

## Step 3: Fix Windmill Transition — Enhanced Spinning Effect

### File: `src/components/ui.tsx`

The current `WindmillTransition` likely fades content. Replace it with a spinning windmill effect.

**If `WindmillTransition` is defined in `src/components/ui.tsx`**, replace it:

```tsx
// === REPLACE WindmillTransition with this ===
import { motion, AnimatePresence } from 'motion/react';

export function WindmillTransition({ activeKey }: { activeKey: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, rotate: -90, scale: 0.85 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, rotate: 90, scale: 0.85 }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 20,
          opacity: { duration: 0.25 },
        }}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
        className="windmill-overlay"
      />
    </AnimatePresence>
  );
}
```

**Alternative** — If `WindmillTransition` is imported elsewhere, create a new file:

### File: `src/components/WindmillTransition.tsx` (new)

```tsx
import { motion, AnimatePresence } from 'motion/react';

export function WindmillTransition({ activeKey }: { activeKey: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, rotate: -120, scale: 0.8 }}
        animate={{ opacity: [0, 0.15, 0], rotate: [-120, 0, 0], scale: [0.8, 1.05, 1] }}
        transition={{
          duration: 0.55,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
        }}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '200vmax',
          height: '200vmax',
          marginLeft: '-100vmax',
          marginTop: '-100vmax',
          pointerEvents: 'none',
          zIndex: 40,
          background: `
            conic-gradient(
              from 0deg,
              transparent 0deg,
              rgba(216, 64, 48, 0.04) 30deg,
              transparent 60deg,
              rgba(24, 57, 92, 0.04) 90deg,
              transparent 120deg,
              rgba(211, 154, 41, 0.04) 150deg,
              transparent 180deg,
              rgba(216, 64, 48, 0.04) 210deg,
              transparent 240deg,
              rgba(24, 57, 92, 0.04) 270deg,
              transparent 300deg,
              rgba(211, 154, 41, 0.04) 330deg,
              transparent 360deg
            )
          `,
        }}
      />
    </AnimatePresence>
  );
}
```

Then update `Shell.tsx` imports:

```tsx
// Remove WindmillTransition from ui import
import { StatusPill } from './ui';
import { WindmillTransition } from './WindmillTransition'; // NEW
```

---

## Step 4: Update Buttons — Wasabi Paper (山葵和紙) Button CSS

### File: `src/styles.css`

Add the following CSS block after the existing `.magic-ripple-button` section:

```css
/* ========== WASABI PAPER BUTTONS (山葵和紙) ========== */

/* Origami fold corner effect on buttons */
.washi-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 12px 24px;
  border: 1px solid rgba(121, 89, 55, 0.22);
  border-radius: 16px;
  background:
    linear-gradient(145deg, #faf6ee 0%, #f5ead8 40%, #efe5d0 100%);
  color: var(--navy);
  font-family: Georgia, "Times New Roman", "Noto Serif TC", serif;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow:
    0 4px 0 #d4c4a8,
    0 6px 12px rgba(84, 57, 30, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  transition: all 0.15s ease;
  overflow: hidden;
}
.washi-btn::before {
  /* Origami fold corner — top-right */
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 20px 20px 0;
  border-color: transparent rgba(180, 160, 130, 0.35) transparent transparent;
  transition: border-width 0.2s ease;
}
.washi-btn:hover {
  transform: translateY(-2px);
  box-shadow:
    0 6px 0 #d4c4a8,
    0 10px 20px rgba(84, 57, 30, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}
.washi-btn:hover::before {
  border-width: 0 28px 28px 0;
}
.washi-btn:active {
  transform: translateY(3px);
  box-shadow:
    0 1px 0 #d4c4a8,
    0 2px 6px rgba(84, 57, 30, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.52);
}

/* Ink ripple on click */
.washi-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at var(--ripple-x, 50%) var(--ripple-y, 50%),
    rgba(24, 57, 92, 0.12) 0%,
    transparent 60%);
  opacity: 0;
  transform: scale(0.5);
  transition: opacity 0.3s ease, transform 0.4s ease;
  pointer-events: none;
}
.washi-btn.rippling::after {
  opacity: 1;
  transform: scale(2);
}

/* Primary action variant (red washi) */
.washi-btn-primary {
  background:
    linear-gradient(145deg, #e85a4a 0%, #d94132 50%, #c43024 100%);
  color: #fff;
  border-color: rgba(160, 50, 30, 0.32);
  box-shadow:
    0 4px 0 #a03020,
    0 6px 16px rgba(180, 50, 30, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.24);
}
.washi-btn-primary::before {
  border-color: transparent rgba(255, 255, 255, 0.2) transparent transparent;
}
.washi-btn-primary:hover {
  box-shadow:
    0 6px 0 #a03020,
    0 10px 24px rgba(180, 50, 30, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
.washi-btn-primary:active {
  box-shadow:
    0 1px 0 #a03020,
    0 2px 8px rgba(180, 50, 30, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

/* Shimmer button override for Magic UI */
.shimmer-washi {
  --shimmer-color: rgba(211, 154, 41, 0.35);
  border-radius: 16px !important;
  font-family: Georgia, "Times New Roman", "Noto Serif TC", serif !important;
}
```

### File: Create `src/hooks/useInkRipple.ts` (new)

```tsx
import { useCallback, useRef } from 'react';

export function useInkRipple() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const triggerRipple = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    btn.style.setProperty('--ripple-x', `${x}%`);
    btn.style.setProperty('--ripple-y', `${y}%`);
    btn.classList.add('rippling');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      btn.classList.remove('rippling');
    }, 500);
  }, []);

  return { triggerRipple };
}
```

---

## Step 5: Add Japanese Art Effects — Origami, Byobu, Washi CSS

### File: `src/styles.css`

Add this entire block at the end of the file:

```css
/* ========== JAPANESE ART EFFECTS (和風美術) ========== */

/* ---- Byobu (屏風) folding screen card effect ---- */
.byobu-card {
  position: relative;
  background:
    linear-gradient(90deg,
      rgba(250, 246, 238, 0.95) 0%,
      rgba(245, 238, 225, 0.92) 48%,
      rgba(238, 230, 216, 0.88) 49%,
      rgba(235, 226, 210, 0.82) 50%,
      rgba(238, 230, 216, 0.88) 51%,
      rgba(245, 238, 225, 0.92) 52%,
      rgba(250, 246, 238, 0.95) 100%
    );
  border: 1px solid rgba(180, 160, 130, 0.28);
  border-radius: 20px;
  box-shadow:
    0 12px 32px rgba(84, 57, 30, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.64);
  overflow: hidden;
}
.byobu-card::before {
  /* Gold leaf accent line (金箔) */
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 100%;
  background: linear-gradient(
    transparent 5%,
    rgba(211, 154, 41, 0.35) 20%,
    rgba(211, 154, 41, 0.55) 50%,
    rgba(211, 154, 41, 0.35) 80%,
    transparent 95%
  );
}

/* ---- Washi paper texture overlay ---- */
.washi-texture {
  position: relative;
}
.washi-texture::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.18;
  background-image:
    /* Fiber texture */
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(139, 115, 85, 0.04) 2px,
      rgba(139, 115, 85, 0.04) 4px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 3px,
      rgba(139, 115, 85, 0.03) 3px,
      rgba(139, 115, 85, 0.03) 7px
    );
  mix-blend-mode: multiply;
}

/* ---- Origami crane floating animation ---- */
@keyframes origami-float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-6px) rotate(2deg); }
  50% { transform: translateY(-3px) rotate(-1deg); }
  75% { transform: translateY(-8px) rotate(1.5deg); }
}
.origami-float {
  animation: origabi-float 4s ease-in-out infinite;
}

/* ---- Sakura (cherry blossom) petal fall ---- */
@keyframes petal-fall {
  0% {
    transform: translateY(-10%) rotate(0deg) translateX(0);
    opacity: 0.7;
  }
  25% {
    transform: translateY(25%) rotate(90deg) translateX(20px);
    opacity: 0.5;
  }
  50% {
    transform: translateY(50%) rotate(180deg) translateX(-15px);
    opacity: 0.6;
  }
  75% {
    transform: translateY(75%) rotate(270deg) translateX(10px);
    opacity: 0.4;
  }
  100% {
    transform: translateY(110%) rotate(360deg) translateX(0);
    opacity: 0;
  }
}
.petal {
  position: fixed;
  top: -20px;
  width: 12px;
  height: 12px;
  background: radial-gradient(circle at 30% 30%, #ffd1dc, #ffb7c5);
  border-radius: 150% 0 150% 0;
  opacity: 0;
  pointer-events: none;
  z-index: 1;
  animation: petal-fall linear infinite;
}

/* ---- Ink wash (sumi-e) divider ---- */
.sumi-divider {
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(24, 57, 92, 0.25) 20%,
    rgba(24, 57, 92, 0.45) 50%,
    rgba(24, 57, 92, 0.25) 80%,
    transparent 100%
  );
  border-radius: 1px;
  margin: 16px 0;
}

/* ---- Japanese pattern: Seigaiha (青海波) wave pattern ---- */
.seigaiha-bg {
  background-image:
    radial-gradient(circle at 100% 150%, transparent 40%, rgba(173, 146, 112, 0.06) 41%, rgba(173, 146, 112, 0.06) 43%, transparent 44%),
    radial-gradient(circle at 0% 150%, transparent 40%, rgba(173, 146, 112, 0.06) 41%, rgba(173, 146, 112, 0.06) 43%, transparent 44%),
    radial-gradient(circle at 50% 100%, transparent 35%, rgba(173, 146, 112, 0.06) 36%, rgba(173, 146, 112, 0.06) 38%, transparent 39%);
  background-size: 40px 35px;
}
```

---

## Step 6: Add Background Effects — Particles, Aurora, Texture

### File: `src/components/Shell.tsx`

Replace the background section with a richer Japanese-themed background.

```tsx
// === ADD IMPORTS at top ===
import { Particles } from './ui/particles';

// === REPLACE the NoiseTexture line (around line 75) ===
// BEFORE:
//   <NoiseTexture aria-hidden="true" focusable="false" className="pointer-events-none fixed inset-0 -z-20 opacity-[0.11] mix-blend-soft-light" />

// AFTER:
  {/* Japanese particle background — sakura petals floating */}
  <Particles
    className="pointer-events-none fixed inset-0 -z-20"
    quantity={35}
    ease={80}
    color="#d4a574"
    staticity={40}
    size={0.6}
    aria-hidden="true"
  />
  <NoiseTexture
    aria-hidden="true"
    focusable="false"
    className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] mix-blend-soft-light"
  />
```

### File: `src/styles.css`

Update the `body` background to include aurora/washi layering:

```css
/* ========== ENHANCED BACKGROUND ========== */

/* Replace the existing body background with this enhanced version */
body {
  margin: 0;
  min-height: 100svh;
  background:
    /* Layer 1: Subtle aurora glow — top right */
    radial-gradient(ellipse at 85% 10%, rgba(216, 64, 48, 0.10) 0%, transparent 45%),
    /* Layer 2: Cool blue wash — left side */
    radial-gradient(ellipse at 5% 40%, rgba(24, 57, 92, 0.07) 0%, transparent 50%),
    /* Layer 3: Warm gold accent — bottom */
    radial-gradient(ellipse at 50% 95%, rgba(211, 154, 41, 0.08) 0%, transparent 40%),
    /* Layer 4: Large soft highlight */
    radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.45), transparent 55%),
    /* Layer 5: Top-left warm bloom */
    radial-gradient(circle at 10% -5%, rgba(255, 229, 189, 0.55), transparent 30%),
    /* Base gradient — warm cream */
    linear-gradient(180deg, #fdf5e4 0%, #f5ead8 35%, #f0e5d2 70%, #ebe0cc 100%);
  color: var(--ink);
  overflow-x: hidden;
}

/* Remove the old body::before and body::after and replace with cleaner version */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  opacity: 0.35;
  /* Subtle washi paper fiber dots */
  background-image:
    radial-gradient(ellipse at 20% 30%, rgba(139, 115, 85, 0.10) 0 1px, transparent 2px),
    radial-gradient(ellipse at 76% 46%, rgba(139, 115, 85, 0.08) 0 1px, transparent 2px),
    radial-gradient(ellipse at 45% 72%, rgba(139, 115, 85, 0.06) 0 1px, transparent 2px);
  background-size: 52px 48px, 38px 42px, 64px 56px;
}
```

---

## Step 7: Add Text Animations — TextAnimate, AuroraText, HyperText

### File: `src/components/ui.tsx` (or create `src/components/ui/index.ts`)

Add re-exports for easy importing:

```tsx
// Re-export Magic UI text components
export { TextAnimate } from './ui/text-animate';
export { AuroraText } from './ui/aurora-text';
export { HyperText } from './ui/hyper-text';
export { SparklesText } from './ui/sparkles-text';
export { AnimatedGradientText } from './ui/animated-gradient-text';
```

### File: `src/tabs/Dashboard.tsx`

Apply text animations to the dashboard title and key numbers.

```tsx
// === ADD IMPORT ===
import { TextAnimate } from '../components/ui/text-animate';
import { AuroraText } from '../components/ui/aurora-text';
import { HyperText } from '../components/ui/hyper-text';
import { NumberTicker } from '../components/ui/number-ticker';

// === In the JSX, update the trip title ===
// BEFORE: <h1>Trip Command Center</h1> in Shell
// Or in Dashboard, update the main heading:

// AFTER — Animated title:
<h1 className="dashboard-title">
  <AuroraText
    colors={['#18395c', '#d94132', '#d39a29', '#18395c']}
    speed={1.2}
  >
    Trip Command Center
  </AuroraText>
</h1>

// === For budget numbers, use HyperText or NumberTicker ===
// BEFORE: <strong>{formatAmount(budget)}</strong>
// AFTER:
<HyperText
  className="budget-number"
  duration={1200}
  animateOnHover
>
  {formatAmount(budget)}
</HyperText>

// === For section headers, use TextAnimate ===
// BEFORE: <h2>Today&apos;s Itinerary</h2>
// AFTER:
<TextAnimate
  animation="blurInUp"
  by="character"
  duration={0.6}
  delay={0.1}
>
  Today&apos;s Itinerary
</TextAnimate>
```

### File: `src/tabs/Stats.tsx`

Apply animated text to stat headers:

```tsx
// === ADD IMPORT ===
import { TextAnimate } from '../components/ui/text-animate';
import { SparklesText } from '../components/ui/sparkles-text';

// === In the JSX, wrap section titles ===
// AFTER:
<TextAnimate animation="slideUp" by="word">
  Spending Breakdown
</TextAnimate>

// For highlighted numbers:
<SparklesText
  sparklesCount={8}
  colors={[{ bg: '#d94132', text: '#fff' }, { bg: '#d39a29', text: '#fff' }]}
>
  {topCategory}
</SparklesText>
```

---

## Step 8: Add Card Effects — ShineBorder, GlareHover, MagicCard

### File: `src/components/Shell.tsx`

Wrap the main content area with card effects.

```tsx
// === ADD IMPORTS ===
import { ShineBorder } from './ui/shine-border';
import { MagicCard } from './ui/magic-card';
```

### File: `src/tabs/Dashboard.tsx`

Apply card effects to key dashboard cards.

```tsx
// === ADD IMPORTS ===
import { ShineBorder } from '../components/ui/shine-border';
import { GlareHover } from '../components/ui/glare-hover';
import { MagicCard } from '../components/ui/magic-card';

// === Wrap the hero/dashboard cards ===
// For the main budget/overview card:
<ShineBorder
  borderWidth={2}
  duration={12}
  shineColor={['#d94132', '#d39a29', '#18395c', '#d94132']}
  className="dashboard-hero-card"
>
  {/* existing card content */}
</ShineBorder>

// For metric cards, use GlareHover:
<GlareHover
  background="rgba(255, 253, 247, 0.85)"
  className="metric-card-glow"
>
  {/* existing metric content */}
</GlareHover>

// For glass cards with spotlight effect:
<MagicCard
  gradientColor="rgba(211, 154, 41, 0.25)"
  gradientSize={180}
  className="glass-magic-card"
>
  {/* existing card content */}
</MagicCard>
```

### File: `src/styles.css`

Add wrapper styles for the card effects:

```css
/* ========== CARD EFFECT WRAPPERS ========== */

.dashboard-hero-card {
  border-radius: 24px;
  background: var(--glass);
  backdrop-filter: blur(18px) saturate(1.15);
}

.metric-card-glow {
  border-radius: 20px;
  padding: 14px;
  transition: transform 0.2s ease;
}
.metric-card-glow:hover {
  transform: translateY(-2px) scale(1.01);
}

.glass-magic-card {
  border-radius: 24px;
  padding: 16px;
}
```

---

## Step 9: Add Special Effects — Confetti, BentoGrid, Playful Elements

### File: `src/tabs/Dashboard.tsx`

Add confetti on budget milestone and bento grid layout.

```tsx
// === ADD IMPORTS ===
import { Confetti } from '../components/ui/confetti';
import { BentoGrid, BentoCard } from '../components/ui/bento-grid';
import { PulsatingButton } from '../components/ui/pulsating-button';
import { ShimmerButton } from '../components/ui/shimmer-button';

// === State for confetti trigger ===
const [showConfetti, setShowConfetti] = useState(false);

// Trigger confetti when budget is within 10% of limit
useEffect(() => {
  if (budgetUsed >= budgetLimit * 0.9 && budgetUsed < budgetLimit) {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  }
}, [budgetUsed, budgetLimit]);

// === In JSX, add Confetti component ===
{showConfetti && (
  <Confetti
    duration={3000}
    particleCount={80}
    colors={['#d94132', '#d39a29', '#18395c', '#e85a4a', '#4c83ba']}
  />
)}

// === Replace action buttons with ShimmerButton ===
// BEFORE: <button className="primary">Add Expense</button>
// AFTER:
<ShimmerButton
  shimmerColor="#d39a29"
  shimmerSize="0.15em"
  shimmerDuration="2s"
  borderRadius="16px"
  background="linear-gradient(145deg, #d94132, #c43024)"
  className="washi-btn-primary shimmer-washi"
  onClick={onManual}
>
  <span className="flex items-center gap-2">
    <Plus size={20} />
    Add Expense
  </span>
</ShimmerButton>

// === Pulsating CTA for scan ===
<PulsatingButton
  pulseColor="rgba(24, 57, 92, 0.25)"
  duration="2s"
  className="scan-cta-btn"
  onClick={() => onTab('scan')}
>
  <ScanLine size={20} />
  Scan Receipt
</PulsatingButton>
```

### File: `src/components/ui/confetti.tsx` (wrapper)

If the Magic UI confetti component needs a simpler wrapper, create:

```tsx
// src/components/ui/confetti-trigger.tsx
'use client';

import { useEffect, useState } from 'react';
import Confetti from './confetti';

interface ConfettiTriggerProps {
  trigger: boolean;
  duration?: number;
  particleCount?: number;
  colors?: string[];
}

export function ConfettiTrigger({
  trigger,
  duration = 3000,
  particleCount = 60,
  colors = ['#d94132', '#d39a29', '#18395c', '#4c83ba'],
}: ConfettiTriggerProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (trigger) {
      setActive(true);
      const t = setTimeout(() => setActive(false), duration);
      return () => clearTimeout(t);
    }
  }, [trigger, duration]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <Confetti
        options={{
          particleCount,
          spread: 70,
          origin: { y: 0.6 },
          colors,
        }}
      />
    </div>
  );
}
```

### File: `src/styles.css`

Add playful micro-interaction styles:

```css
/* ========== PLAYFUL MICRO-INTERACTIONS ========== */

/* Emoji bounce on hover */
.emoji-bounce {
  display: inline-block;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.emoji-bounce:hover {
  transform: scale(1.3) rotate(-8deg);
}

/* Wobble animation for fun elements */
@keyframes wobble {
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(-5deg); }
  30% { transform: rotate(3deg); }
  45% { transform: rotate(-3deg); }
  60% { transform: rotate(2deg); }
  75% { transform: rotate(-1deg); }
}
.wobble:hover {
  animation: wobble 0.6s ease;
}

/* Gentle pulse for notifications */
@keyframes gentle-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(217, 65, 50, 0.25); }
  50% { box-shadow: 0 0 0 10px rgba(217, 65, 50, 0); }
}
.gentle-pulse {
  animation: gentle-pulse 2.5s ease-in-out infinite;
}

/* Floating animation for decorative elements */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.float-animation {
  animation: float 3.5s ease-in-out infinite;
}

/* Spin-slow for decorative icons */
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spin-slow {
  animation: spin-slow 12s linear infinite;
}

/* Scale-in entrance for new elements */
@keyframes scale-in {
  from { opacity: 0; transform: scale(0.88); }
  to { opacity: 1; transform: scale(1); }
}
.scale-in {
  animation: scale-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* Stagger children entrance */
.stagger-children > * {
  animation: scale-in 0.3s ease both;
}
.stagger-children > *:nth-child(1) { animation-delay: 0.05s; }
.stagger-children > *:nth-child(2) { animation-delay: 0.10s; }
.stagger-children > *:nth-child(3) { animation-delay: 0.15s; }
.stagger-children > *:nth-child(4) { animation-delay: 0.20s; }
.stagger-children > *:nth-child(5) { animation-delay: 0.25s; }
.stagger-children > *:nth-child(6) { animation-delay: 0.30s; }

/* Scan CTA button style */
.scan-cta-btn {
  min-height: 52px;
  padding: 12px 28px;
  border-radius: 18px;
  background: linear-gradient(145deg, #18395c, #2a5580);
  color: #fff;
  font-weight: 800;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: none;
  cursor: pointer;
}
```

---

## Step 10: Polish & Testing — Reduced Motion, Performance

### File: `src/components/Shell.tsx`

Add reduced motion support:

```tsx
// === ADD at top of Shell component ===
import { useReducedMotion } from 'motion/react';

// Inside Shell():
const prefersReducedMotion = useReducedMotion() ?? false;

// Pass to WindmillTransition:
<WindmillTransition activeKey={active} reducedMotion={prefersReducedMotion} />

// Wrap particles in reduced motion check:
{!prefersReducedMotion && (
  <Particles
    className="pointer-events-none fixed inset-0 -z-20"
    quantity={35}
    ease={80}
    color="#d4a574"
    staticity={40}
    size={0.6}
    aria-hidden="true"
  />
)}
```

### File: `src/components/WindmillTransition.tsx` (update)

```tsx
interface WindmillTransitionProps {
  activeKey: string;
  reducedMotion?: boolean;
}

export function WindmillTransition({ activeKey, reducedMotion = false }: WindmillTransitionProps) {
  if (reducedMotion) {
    // Simple fade for reduced motion
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
        />
      </AnimatePresence>
    );
  }

  // Full windmill spin (original from Step 3)
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, rotate: -120, scale: 0.8 }}
        animate={{ opacity: [0, 0.15, 0], rotate: [-120, 0, 0], scale: [0.8, 1.05, 1] }}
        transition={{ duration: 0.55, ease: 'easeInOut', times: [0, 0.5, 1] }}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '200vmax',
          height: '200vmax',
          marginLeft: '-100vmax',
          marginTop: '-100vmax',
          pointerEvents: 'none',
          zIndex: 40,
          background: `conic-gradient(from 0deg, transparent 0deg, rgba(216,64,48,0.04) 30deg, transparent 60deg, rgba(24,57,92,0.04) 90deg, transparent 120deg, rgba(211,154,41,0.04) 150deg, transparent 180deg, rgba(216,64,48,0.04) 210deg, transparent 240deg, rgba(24,57,92,0.04) 270deg, transparent 300deg, rgba(211,154,41,0.04) 330deg, transparent 360deg)`,
        }}
      />
    </AnimatePresence>
  );
}
```

### File: `src/styles.css`

Add reduced motion media query at the very end:

```css
/* ========== ACCESSIBILITY — Reduced Motion ========== */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.15s !important;
    scroll-behavior: auto !important;
  }

  .petal,
  .origami-float,
  .float-animation,
  .spin-slow {
    animation: none !important;
  }

  .windmill-overlay {
    display: none !important;
  }
}

/* ========== PERFORMANCE ========== */

/* GPU-accelerated animations */
.gpu-layer {
  transform: translateZ(0);
  will-change: transform;
}

/* Contain paint for complex card effects */
.paint-contained {
  contain: paint;
}

/* Content visibility for off-screen sections */
.lazy-render {
  content-visibility: auto;
  contain-intrinsic-size: auto 300px;
}
```

### File: `src/main.tsx`

Add smooth scroll with Lenis (optional):

```tsx
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import { App } from './App';
import './styles.css';

function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const lenis = new Lenis({
      duration: 1.0,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => { lenis.destroy(); };
  }, []);

  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SmoothScrollProvider>
      <App />
    </SmoothScrollProvider>
  </StrictMode>,
);
```

---

## Component Mapping Summary

| Location | Current | Replace With | Magic UI Component |
|----------|---------|-------------|-------------------|
| `Shell.tsx` header title | `<h1>` | `<AuroraText>` | `@magicui/aurora-text` |
| `Dashboard.tsx` budget ring | Custom CSS | `<AnimatedCircularProgressBar>` | `@magicui/animated-circular-progress-bar` |
| `Dashboard.tsx` action buttons | `<button>` | `<ShimmerButton>` | `@magicui/shimmer-button` |
| `Dashboard.tsx` scan CTA | `<button>` | `<PulsatingButton>` | `@magicui/pulsating-button` |
| `Dashboard.tsx` sections | Static | `<TextAnimate>` headers | `@magicui/text-animate` |
| `Stats.tsx` numbers | `<strong>` | `<HyperText>` | `@magicui/hyper-text` |
| `Stats.tsx` highlighted text | `<span>` | `<SparklesText>` | `@magicui/sparkles-text` |
| `Dashboard.tsx` cards | `.card` | `<ShineBorder>` wrapper | `@magicui/shine-border` |
| `Dashboard.tsx` metric cards | `.metric-card` | `<GlareHover>` wrapper | `@magicui/glare-hover` |
| `Dashboard.tsx` glass cards | `.glass-card` | `<MagicCard>` | `@magicui/magic-card` |
| `Dashboard.tsx` layout | Grid | `<BentoGrid>` | `@magicui/bento-grid` |
| `Dashboard.tsx` celebrations | None | `<Confetti>` on milestones | `@magicui/confetti` |
| `Shell.tsx` background | Static | `<Particles>` | `@magicui/particles` |
| Tab transition | Fade | Windmill spin | Custom (Step 3) |
| Tab bar | Flow | Fixed bottom | CSS (Step 2) |
| All buttons | Plain | Wasabi paper style | CSS (Step 4) |
| Cards | Glass | Byobu folding screen | CSS (Step 5) |

---

## Quick Verification Checklist

After completing all steps, verify:

1. [ ] All P0 components are installed and import without errors
2. [ ] Tab bar stays fixed at bottom when scrolling
3. [ ] Tab switch shows windmill spinning transition
4. [ ] Buttons have origami fold corner and ink ripple on click
5. [ ] Background has subtle particle animation
6. [ ] Title has aurora color-shifting effect
7. [ ] Budget numbers animate with hyper-text scramble
8. [ ] Cards have shine border on hover
9. [ ] Confetti fires on budget milestones
10. [ ] Reduced motion preference is respected
11. [ ] No console errors or warnings
12. [ ] Build succeeds: `npm run build`
