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
