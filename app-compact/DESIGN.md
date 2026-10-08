# Epic Glass Field Design Spec

This document defines the Compact visual direction for `app-compact/`.
It is documentation only and must not contain credentials, account IDs, tokens,
or private trip data.

## North Star

Epic Glass Field is a travel ledger that feels like Japanese washi paper under
clear, functional glass. Content stays warm, calm, and readable. Controls,
navigation, receipts actions, and transient overlays float above it as a
disciplined Liquid Glass-inspired layer.

The app should feel premium without becoming decorative. Every glass effect
must help hierarchy, scannability, or touch confidence.

## Research Record

Checked on 2026-05-09 HKT.

| Source | Use As Inspiration | Guardrail |
|---|---|---|
| Magic UI | Local versions of `Magic Card`, `Border Beam`, `Progressive Blur`, `Blur Fade`, `Number Ticker`, `Dock`, `Animated List`, `Noise Texture`, and `Scroll Progress`. | Do not copy in a dependency during this docs pass. Recreate only small effects that pass build, bundle, and mobile smoke. |
| Aceternity UI | Interaction ideas from `Card Spotlight`, `Expandable Cards`, `File Upload`, `Floating Dock`, `Stateful Button`, `Parallax Grid Scroll`, `Moving Border`, and `Animated Tabs`. | It is Tailwind/shadcn-oriented, so port behavior manually into the existing handmade system. |
| Apple Liquid Glass / HIG | Treat glass as a distinct functional layer for controls and navigation above content; use it sparingly; preserve legibility and accessibility fallbacks. | Do not put heavy Liquid Glass on the main content layer. Content cards should use quieter standard materials. |
| v0 / Vercel MCP | Use only for ideation or reviewed code generation after user-controlled login. Vercel MCP endpoint is `https://mcp.vercel.com`. | Never store OAuth state, project secrets, or generated credentials in repo docs. Keep write-capable tools manual/approval-led. |
| 21st.dev Magic | Use as an AI UI variation prompt source for component alternatives and shadcn-style ideas. | MCP/API keys stay local-only and user-provided. Treat generated output as draft code requiring review. |
| Tamagui | Possible later spike for cross-platform tokens and adaptive primitives. | Not part of the production path until isolated Vite spike passes typecheck, build, audit, bundle review, and mobile smoke. |

References are mirrored in `UI_RESOURCES.md`.

## Glass Layer Anatomy

| Layer | Name | Role | Treatment |
|---|---|---|---|
| 0 | Field | Trip content, receipt data, weather cards, charts, settings copy. | Warm opaque or lightly translucent paper surfaces. No heavy refraction. |
| 1 | Functional Glass | Bottom tab dock, primary actions, scan inputs, filter controls, sync controls. | `backdrop-filter: blur(18px) saturate(1.35)`, translucent fill, crisp hairline, edge refraction. |
| 2 | Transient Glass | Modals, popovers, upload progress, settlement confirmations, toasts. | Stronger blur, dim veil behind when needed, predictable focus trap and escape paths. |
| 3 | Optical Detail | Edge shine, corner glint, hover spotlight, scroll shimmer. | Pseudo-elements only. Must not resize layout or hide text. |

Glass belongs to Layer 1 and Layer 2. Layer 0 can show quiet paper texture and
soft elevation, but it should not compete with controls.

## Edge Refraction

Use a faux refraction system because CSS cannot provide true optical bending in
all browsers:

- Main surface: translucent off-white fill with blur and saturation.
- Inner edge: `inset 0 0 0 1px rgba(255,255,255,.58)`.
- Outer edge: low-contrast warm shadow plus a cool shadow on the opposite side.
- Top-left refraction: linear highlight from white to transparent.
- Bottom-right refraction: amber/indigo tint at very low opacity.
- Rich backgrounds need a dimming layer behind clear glass to preserve text.

Suggested tokenized shape:

```css
.glass-field {
  background: linear-gradient(135deg, var(--glass-rice), var(--glass-shoji));
  border: 1px solid var(--glass-edge);
  box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-highlight);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}
```

## Corner Glint

Corner glint is the signature detail. It should be visible only on important
interactive glass, not every card.

- Use a pseudo-element with `conic-gradient` anchored to the active corner.
- Default opacity: `.18`; hover/focus opacity: `.34`.
- Size: 42-72px on mobile, 56-96px on desktop.
- Motion: drift no more than 4px or 4deg.
- Disable drift under `prefers-reduced-motion`.
- Never place glint behind label text or icons with fine strokes.

## Timeline Rail Motion

The Itinerary rail uses motion as orientation, not decoration.

- Active trip dates: the rail can use a brighter red/gold/green fill and a subtle vertical sweep to show where the current time has reached in the planned spot list.
- Outside trip dates: keep the same red/gold/green identity, but dim it. Do not make the rail colourless or grey; it should read as the same trip line at rest.
- The live marker appears only when the current date matches an itinerary day.
- The rail must live in its own gutter and never overlap event title, note, address, or action buttons on mobile.

## Cream And Japanese Tokens

Keep the palette warm and Japanese-inspired, but not one-note cream. Pair paper
neutrals with ink, indigo, matcha, ume, and sky accents.

| Token | Value | Use |
|---|---:|---|
| `--field-kinari` | `#f8f1e4` | App field background. |
| `--field-washi` | `#fff8ea` | Content card surface. |
| `--field-rice` | `#fbf6ed` | Raised standard material. |
| `--ink-sumi` | `#25211b` | Primary text. |
| `--ink-soft` | `#6f6557` | Secondary text. |
| `--glass-rice` | `rgba(255, 250, 239, .68)` | Glass fill start. |
| `--glass-shoji` | `rgba(255, 255, 255, .42)` | Glass fill end. |
| `--glass-edge` | `rgba(255, 255, 255, .64)` | Glass border. |
| `--accent-indigo` | `#38516f` | Navigation active state, charts. |
| `--accent-ume` | `#b95c6b` | Warnings, settlement emphasis. |
| `--accent-matcha` | `#71855f` | Success, paid, synced. |
| `--accent-sora` | `#6fa7bd` | Weather, informational hints. |
| `--accent-kohaku` | `#d59b47` | Receipts, totals, glints. |

Typography stays practical: use existing font stack unless a later design pass
adds a licensed face. Letter spacing should remain `0` for app UI.

## Scroll Parallax

Parallax should make the field feel alive without moving the ledger away from
the user.

- Field texture: translate at 20-30% of scroll speed.
- Glass dock shimmer: translate at 8-12% of scroll speed.
- Section headers: max 8px vertical drift.
- Receipt or weather cards: no individual parallax in dense lists.
- Use `transform` and `opacity` only; do not animate layout properties.
- Clamp motion on mobile to half the desktop range.
- Disable all parallax under `prefers-reduced-motion`.

## Windmill Tab Transition

The bottom tab dock can use a windmill transition as the app's main navigation
gesture.

- The active tab indicator rotates from a central hub toward the target tab.
- Icons rotate up to 22deg during travel, then settle to 0deg.
- Outgoing panel fades and shifts 8px opposite the direction of travel.
- Incoming panel fades in and shifts from 8px along the direction of travel.
- Duration: 180-240ms; easing: `cubic-bezier(.2,.8,.2,1)`.
- Keep tab labels readable at all times; never rotate text.
- Reduced motion fallback: instant indicator movement plus 80ms opacity fade.

## Generated Icon And Avatar Style

Generated visual assets should look bespoke but safe for a public travel app.

- Icons: simple filled-line hybrid, 1.75px optical stroke, rounded terminals,
  paper-cut silhouette, subtle rice-paper grain.
- Motifs: train ticket, receipt corner, yen coin, suitcase tag, cloud, map pin,
  windmill tab hub, glass droplet.
- Avatars: abstract stamps or luggage tags; no real faces, emails, initials from
  private accounts, or photos pulled from user data.
- Palette: one paper base, one ink line, one accent. Avoid rainbow packs.
- Export: SVG only when hand-authored and reviewed; generated bitmap assets need
  private-data review before commit.

## Contrast And Accessibility

Glass is allowed only when text remains readable in the worst background case.

- Body text target: WCAG 2.2 AA contrast, at least 4.5:1.
- Large numbers and tab labels: at least 3:1, preferably higher.
- Add a scrim behind clear glass if the background is bright, busy, or moving.
- `prefers-contrast: more`: make glass opaque, increase border contrast, remove
  low-opacity text, and keep focus rings strong.
- `prefers-reduced-transparency`: replace glass fill with opaque paper surface
  where browser support exists.
- `prefers-reduced-motion`: remove parallax, glint drift, shimmer loops, and
  windmill rotation; keep state changes clear with static position and opacity.
- Forced colors: use system colors and visible borders; no meaning by blur,
  shadow, or color alone.

## Implementation Guardrails

- Keep the Compact production path as React + Vite + TypeScript + `motion` + local CSS
  primitives.
- Any external UI reference must be re-authored locally unless the user approves
  a dependency spike.
- Components must keep stable dimensions across hover, loading, and error
  states.
- Mobile width is first-class; no text overlap in tab labels, cards, buttons, or
  scan controls.
- Never write credentials, API keys, OAuth tokens, authorization headers, real
  emails, private trip names, or screenshot-derived private labels into docs.
- Before staging screenshots or generated graph artifacts, perform a private
  data review.

## Review Checklist

- Glass is restricted to controls/navigation/transient overlays.
- Content cards remain warm, readable, and quiet.
- Edge refraction and corner glint do not hide text.
- Scroll and windmill motion respect reduced-motion settings.
- Contrast fallback works on noisy backgrounds.
- Generated icons/avatars contain no private data.
- Build/typecheck/mobile smoke are required before this spec becomes code.

## Scan Surface: Passport Stamp Page

Recorded 2026-10-04 from the built `src/tabs/Scan.tsx` and `src/styles/scan.css`.
This is a surface-scope language inside the theme world, not a new app identity.
The trip is a passport and every receipt is an entry stamp.

**Divergence from Epic Glass Field.** The Glass Layer Anatomy above lists "scan
inputs" as Layer 1 glass. The built Scan tab uses no glass, blur or refraction:
it is an opaque theme-paper page. The bottom dock stays glass; the Scan content
does not. The Scan-specific glossy art tiles, the mock camera viewfinder and the
tile grid of input methods are retired. Do not reintroduce them on this tab.

### Tokens

Every colour and face comes from the active trip theme (`src/theme/tripTheme.tsx`,
12 themes, light and dark). The fixed `--field-*` / `--accent-*` table above does
not apply to this surface.

| Role | Token |
|---|---|
| Page text / muted text | `--theme-text`, `--theme-muted` |
| Paper (strip, shutter face, ledger, sheets) | `--theme-card` |
| Inset fields, rate button | `--theme-surface` |
| Perforation punch colour | `--theme-canvas` |
| Hairlines, dashed rules, empty-stamp ring | `--theme-border` |
| Primary ink (shutter, route stamps, round stamps, day pill) | `--theme-accent` on paper; `--theme-on-accent` when inked |
| Ticket-stamp ink, all focus rings | `--theme-focus` |
| Oval-stamp ink, finished reading step | `--theme-status-success` |
| 待確認 pending mark | `--theme-status-warning` |
| Display face (trip name, shutter label, ledger heading) | `--trip-font-display` |
| Body face (everything else, ring text) | `--trip-font-body` |

Tints are made with `color-mix(in srgb, var(--theme-accent) N%, transparent)`
(14% day pill, 28% selection), never with new hex values.

**The Theme Ink Rule.** No literal colours on this surface except the neutral
drop-shadow `rgb(0 0 0 / .4–.5)`. If a theme looks wrong, fix the theme, not Scan.

### Type

- Trip name: display face, 24px / 700, line-height 1.15, -0.01em.
- Shutter label 掃描收據: display face, 29px / 800, +0.04em.
- Ledger heading 今日入帳: display face, 19px / 700.
- Ring text and date: body face, 11.5–12px / 800, +0.14em tracking.
- Machine-readable line: monospace 10.5px, +0.12em, muted, single line clipped.
- **The Tabular Money Rule.** Every amount, rate, date and Day n count uses
  `font-variant-numeric: tabular-nums`. Amounts are 800 weight.

### Visa strip

The header card: trip name left, rate button right, date range and a Day pill
(`第 n 日 / total`, `出發前 n 日`, or `旅程已完`) below, then a dashed rule and a
44-character passport machine-readable line built only from the trip's country
code, dates and currencies (decorative, `aria-hidden`). Corners are 16px top,
6px bottom; a row of 16px-pitch radial punches in `--theme-canvas` along the
bottom edge makes the perforated tear. The rate button (min 96×64px, 12px radius,
surface fill, border turns accent-tinted on hover) shows `1 HKD` / rate in trip
currency / 匯率 and opens the FX sheet.

### Stamp shutter

The primary action: a 232px circular paper button rotated -5deg in the thumb
zone. An SVG ring draws three concentric circles in accent ink (3.2px outer,
1.2px inner, 1.4px dotted at 1.5/4.5) with `收據 · RECEIPT · 入帳 · ENTRY` set on
an arc, and the face carries a camera glyph, 掃描收據 and today's date.

**The One Press Rule.** The ink-flood press is the surface's one authored motion:
on `:active` the shutter floods to `--theme-accent` with `--theme-on-accent`
content, sinks to scale .95 and the shadow tightens (160ms,
`cubic-bezier(.2,.8,.2,1)`). Hover only straightens it to -2deg. Every other
motion on the page is state feedback, not choreography.

### Reading state

While a photo is being parsed the shutter is replaced in place (inside an
`aria-live="polite"` region, `role="status"`) by the photo itself cropped into a
188px circle with a 6px double accent border, under a slowly turning 2px dashed
accent ring (2.6s linear). Beside it, three honest steps: 整理相片 → AI 讀緊店名、
金額、日期 → 打開確認表. The active step is bold `--theme-text` with a spinner,
done steps are `--theme-status-success` with a check, waiting steps are muted
with a hollow 9px dot. Never show fake percentages or extra steps.

### Route stamps

One row of four equal columns below the shutter: 相簿, 語音, Email, 手動. Each is
a 64px double-bordered (4px double accent) ring on paper with a 22px glyph and
a 14px / 800 label beneath (min target 96px tall). Shapes and tilts vary so the
row reads hand-pressed: 相簿 round -4deg, 語音 14px-radius square +3deg, Email
oval -2deg, 手動 round +5deg. Hover straightens to 0deg; press scales to .92.
語音 and Email are toggles with `aria-pressed`; when open the ring is inked
(accent fill, on-accent glyph), matching the shutter's pressed state, and an
opaque sheet (16px radius, card fill, border) opens beneath with its textarea
and 48px actions.

### Today's ledger stamps

`今日入帳` card with count and total, then up to 9 stamps in a 3-column grid
(overflow line points to 紀錄). Each stamp is a square button with a 3px double
border in its ink, transparent fill, showing category · time, amount and store.

**The Stamp Shape Rule.** Shape and ink together encode the category group:

| Shape | Categories | Ink |
|---|---|---|
| Round (50%) | food, shopping, other (default) | `--theme-accent` |
| Ticket square (12px radius) | transport, flight | `--theme-focus` |
| Oval (50% / 40%) | lodging, ticket, local tour | `--theme-status-success` |

Pending receipts switch to a 2px dashed border and add a 待確認 mark. A stamp
created since the tab mounted lands once (scale 1.35 → 1, 300ms).

**The Stable Tilt Rule.** Each ledger stamp tilts -6 to +6deg from a hash of its
receipt id, so it looks hand-pressed but never jumps between renders. Hover
straightens to 0deg at scale 1.03. Empty state: one 64px muted double ring with
今日未有入帳.

### Layout

- Mobile: single column, max-width 520px, 20px gap; desk stack gap 16px.
- ≥1024px: two columns (`minmax(380px, 440px)` desk + fluid ledger, 32px gap,
  max-width 1120px). The ledger becomes sticky at top 24px, gains 22–24px
  padding, and stamps auto-fill at 128–148px with 18px amounts.

### Motion and reduced motion

Transitions are 120–160ms ease-out or `cubic-bezier(.2,.8,.2,1)`; sheets fade
up 6px in 180ms; the voice mic pulses while listening. Under
`prefers-reduced-motion: reduce` every animation and transition on `.scan-page`
is removed; states still change by fill, colour and border.

### Accessibility and stable test hooks

Focus is a 3px `--theme-focus` outline at 3px offset (6px on the shutter; on
route stamps the ring carries it). Decorative SVG, glyphs, the MRZ line and the
empty ring are `aria-hidden`. These names and ids are test contracts and must
stay stable:

- Accessible names: 相機 (shutter label 相機：掃描收據), 相簿, 手動, 語音, Email,
  匯率 Exchange Rate, 解析, 解析文字, 重開上次草稿, 批次確認.
- File inputs: `#scan-camera-input`, `#scan-gallery-input`,
  `#scan-email-image-input`.

## Style Themes

Recorded 2026-10-08 from `src/theme/tripTheme.tsx` and `src/styles/style-themes.css`.

Region themes swap colour only. A style theme (`ThemeDefinition.kit`) also sets
`html[data-app-style]`, lazy-loads its own Google Fonts, and rebuilds the component
grammar: card shape and depth, button press physics, field shape, chips, headings,
page surface, header and dock. Style themes are manual picks; `auto` stays regional.
Colours still come from `--theme-*`; the kit owns shape and behaviour through
`--st-*` tokens (radius, card border/shadow, button shadow and press transform,
inset panels, toggle fill, row rule).

| Theme | Type | Signature |
|---|---|---|
| 手繪筆記 `sketch_notebook` | LXGW WenKai TC + Caveat | Ruled paper with red margin, wobbly inked cards tilted ±0.4deg with tape corners, highlighter headings, fill-in-the-blank fields, pen-circled active tab. |
| 棉花糖雲 `marshmallow_cloud` | Huninn + Fredoka, no faux bold | Borderless puffy cards, pastel sky blobs, centred header, floating capsule dock, spring press (scale .93). |
| 童趣積木 `kids_blocks` | Chiron GoRound TC + Baloo 2 | 3px ink outlines with a 6px ledge, colour-cycling block caps, yellow banner header, per-tab colour blocks, key-press buttons. |
| 可愛貼紙 `kawaii_sticker` | Iansui + Cherry Bomb One | Polka-dot ground, die-cut sticker cards with dashed stitching and a bow, candy buttons, stitched capsule dock, one-shot wiggle on the active tab. |
| 賽博朋克 `cyberpunk_hud` | Chakra Petch + Chiron Hei HK, Share Tech Mono for money | Chamfered HUD panels with yellow brackets, scanlines, hazard-tape header, full-width hard dock, hexagon scan key, hover glitch. |
| 像素冒險 `pixel_quest` | DotGothic16 + Chiron Hei HK | Dithered ground, RPG menu-window cards, bevelled pixel buttons, hotbar dock with a bobbing gold cursor, segmented HP bars. |
| 江戶浮世繪 `japan_ukiyoe` | Chiron Sung HK | Seigaiha ground, woodblock double-frame cards, headings on an indigo title cartouche, Prussian-blue noren header split into flaps, vermilion hanko buttons, family-crest tab icons, bokashi bars. |
| 韓屋丹青 `korea_dancheong` | Noto Sans TC + Gowun Batang | Changsal lattice ground, bojagi cards with a five-colour dancheong band and patchwork seams, obangsaek heading rule, giwa-roof dock with scalloped eave, dancheong tile icons, rising lotus lanterns. |

Each kit also ships its own assets (`src/theme/kit/`, `src/styles/style-kit-fx.css`):

- **Tab icons** (`KitTabIcon`): one 24px geometry per tab drawn in the kit's hand —
  double pencil line, puffy blob, crayon fill, sticker face, HUD brackets, 12×12
  sprites, family crest, dancheong tile. Used in the phone dock and desktop rail.
- **Category icons** (`KitCategoryIcon`, used by `VisualIcon`): 17 drawn glyphs cover all
  23 category/payment/state ids, rendered in the same hand as the tab icons without the
  kit container (the badge supplies it); the pixel kit has a hand-placed 12×12 sprite
  for each. Badge tokens (`--kit-vi-*`) are declared on `.visual-icon`, not `:root`, so
  they can read each badge's `--icon-color`.
- **Mascot** (`KitMascot`): an animated mark in the header/rail slot — paper plane on
  a dashed loop, squishing marshmallow, pinwheel, winking star, radar sweep, a pixel
  slime GIF (`assets/kit/pixel-slime.gif`, static PNG under reduced motion), crest of
  sun and waves, spinning taegeuk.
- **Ambient** (`KitAmbient`): a fixed layer between the page surface (on `body`) and
  the transparent shell — doodles drawing themselves, drifting clouds, rising bubbles,
  floating hearts, scan sweep and ticker, twinkling pixel stars, moving waves, lotus
  lanterns. Not rendered on the `lite` effects tier.
- **Card entrance** per kit (`--kit-enter`): pencil wipe, squish, block drop, sticker
  peel, boot flicker, stepped pop, ink bleed, unfold; staggered 70ms down `.stack`.
- **Charts and tables** through `--kit-*` tokens: ring colour/cap/segment mask, compass
  hole and frame, pace-bar fill/over/track (hatching, pastel pills, outlined blocks,
  candy stripes, neon segments, HP segments, bokashi, dancheong bands), ranking badges,
  zebra and hover rows, category badge shape.

Responsive checks cover phone (390), fold cover (344), Flip (412), fold open (673),
Pixel Fold open (841), tablet (768) and web (1280/1920), plus resizing between fold
postures without reload. On screens ≤380px the raised scan key shrinks to its dock
column so it never overlaps its neighbours' tap areas.

Rules: every override is `!important` at `:root[data-app-style][data-app-theme][data-color-scheme]`
specificity so it beats the colour layer in `themes.css`; dark kits re-ink the
washi-era components that hard-code dark text; all loops and wiggles sit behind
`prefers-reduced-motion: no-preference`. Settings shows each kit as a live
miniature (font, shape, accent) instead of colour swatches.
