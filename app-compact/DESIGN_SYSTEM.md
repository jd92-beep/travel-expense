# Compact Design System

Last updated: 2026-06-08 HKT

Scope: `app-compact/` only. Do not port these patterns into `app-react/` or the
legacy app unless Boss explicitly asks for parity.

## Token Layers

Compact CSS currently has historical generated-preview layers. New compact UI
work should prefer the semantic tokens in `src/styles/compact.css` before adding
new one-off values.

| Token | Use |
|---|---|
| `--compact-ink`, `--compact-text-muted`, `--compact-text-soft` | Main, detail, and label text. |
| `--compact-blue`, `--compact-red`, `--compact-gold`, `--compact-green` | Core travel control palette. |
| `--compact-radius-panel`, `--compact-radius-card`, `--compact-radius-chip` | Stable card/chip geometry. |
| `--compact-gap-mobile`, `--compact-gutter-mobile` | Mobile grid gaps and edge spacing. |
| `--compact-card-bg`, `--compact-card-border`, `--compact-card-shadow` | Reusable quiet paper cards. |
| `--compact-chip-bg`, `--compact-control-shadow` | Status chips and compact controls. |

## Tab Patterns

Every tab should follow this hierarchy:

1. Shell header and travel-readiness strip.
2. One compact command card or primary cockpit.
3. One or two insight/status rows when useful.
4. The main working list, chart, scanner, weather, route, or settings controls.
5. Secondary diagnostics or methodology notes near the bottom.

## Reusable Patterns

Use a 2-column mobile grid for short insight cards. Keep each card stable in
height, with a small label, one strong value, and one short detail line. Current
examples: Stats budget story cards and Dashboard local AI coach cards.

Use pill chips for ephemeral state: online/offline, sync queue, cache freshness,
provider/source, receipt health, and update/install readiness. Chips should use
solid text/icons and should never rely on glass transparency for legibility.

Use `--compact-gutter-mobile` for full-width shell strips so 360px Android smoke
does not report overflow. Avoid `width: 100%` plus side margins.

## Tab Notes

| Tab | Primary Pattern | Notes |
|---|---|---|
| Dashboard | Budget cockpit plus local coach | Keep forecast/reminder cards local-only unless broker routing is explicit. |
| Scan | One-hand receipt cockpit | Show OCR/batch confidence and recovery before advanced tools. |
| Timeline | Live travel command card | Rails must stay in their own gutter and reflect actual trip time. |
| History | Ledger rows plus health chips | Text/icons must remain solid above glass layers. |
| Weather | Source-aware forecast cards | Provider, freshness, target source, and fallback reason must stay visible. |
| Stats | Budget story cards plus charts | First answer "am I okay?", then show deeper charts and settlement. |
| Settings | Security/control rows | Backup/export copy must state current-trip-only and secret stripping. |

## Guardrails

- Do not commit secrets, local `.env` files, API keys, OAuth tokens, broker
  sessions, or private account data.
- Keep generated assets reviewed and public-safe before committing.
- Mobile geometry must pass `npm run smoke:mobile-layout` after shared layout
  or tab pattern changes.
- Prefer `npm run build` plus a targeted tab smoke before committing visual
  system changes.
