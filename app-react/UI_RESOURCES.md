# UI Resources And MCP Readiness

This file records the design-resource decision for the React renovation. It is safe to commit and contains no credentials.

## Current App Decision

- Keep the app on React 19 + Vite 8 + TypeScript 6.
- Use `motion` for Settings accordion and future tab/receipt transitions.
- Keep custom CSS tokens for the warm travel tone and Liquid Glass card treatment.
- Do not reduce tabs: Dashboard, Scan, Timeline, History, Weather, Stats, Settings.
- Do not import a large UI kit until typecheck, build, mobile smoke, and bundle review stay green.

## Resource Check

Checked on 2026-05-08 HKT against official public docs and local tool availability.

| Resource | Status | Notes |
|---|---|---|
| Magic UI | Docs usable; MCP not installed here | Official docs list MCP setup plus portable components such as Magic Card, Border Beam, Blur Fade, Number Ticker, Animated List, Dock, Progressive Blur, and Animated Circular Progress Bar. `tool_search` did not expose a callable Magic UI MCP in this Codex session. `npm view @magicuidesign/cli` returned version 1.0.3, license ISC. Use as reference or CLI spike only after build/audit/mobile proof. |
| Aceternity UI | Docs usable; no local MCP/tool exposed | Explore page lists components useful for this app: Expandable Cards, File Upload, Floating Dock, Card Spotlight, Animated Modal, Stateful Button, Loaders, Bento Grid, Moving Border. Because it is Tailwind/shadcn-oriented, port patterns manually instead of copying wholesale. |
| v0.dev | Docs usable; account/MCP not connected here | v0 supports bring-your-own MCP and marketplace integrations. Permission mode should remain manual/ask-for-approval for write-capable integrations. Use for ideation only unless the user signs in and reviews generated code. |
| Vercel MCP | Official endpoint documented; not connected here | Official endpoint is `https://mcp.vercel.com`; docs recommend verifying endpoint and keeping human confirmation. This session did not expose a Vercel MCP tool, so no authenticated Vercel action was attempted. |
| 21st.dev Magic | Web docs usable; MCP/account not connected here | 21st.dev Magic advertises MCP server/web interface and a free tier. Treat as optional inspiration; any API key or MCP config must stay local-only and user-provided. |
| Tamagui | Feasible only as isolated spike | Official docs include Vite bundler guidance. `npm view tamagui` returned version 2.0.0-rc.41 and peer dependency `react >=19`, which the app satisfies. Do not adopt globally unless a separate spike passes typecheck, build, audit, bundle review, and mobile smoke. |

## M1 Decision

- Do not install any new UI dependency in the main app during the readiness milestone.
- Keep React 19 + Vite 8 + TypeScript 6 + `motion` + custom CSS primitives as the production path.
- Recreate Magic UI / Aceternity / 21st-style effects locally when they are simple enough, especially glass cards, progress rings, dock polish, animated lists, and expandable cards.
- Use v0/21st only after user-controlled login when needed; generated code must be reviewed before import.
- Keep Tamagui as a later isolated spike, not a prerequisite for the UI masterpiece pass.

## Applied In This Pass

- Settings cards use a reusable `AccordionCard`.
- `motion/react` powers expand/collapse animation.
- CSS now has warm Liquid Glass surfaces, stronger focus states, reduced-motion fallback, and a glass bottom tab dock.
- The Credential Broker card is explicit about safe server-side credential rotation.

## References

- Magic UI MCP: https://magicui.design/docs/mcp
- Magic UI components: https://magicui.design/docs/components
- Aceternity UI components: https://ui.aceternity.com/explore
- v0 MCP docs: https://v0.app/docs/MCP
- Vercel MCP docs: https://vercel.com/docs/agent-resources/vercel-mcp
- Tamagui installation: https://tamagui.dev/docs/intro/installation
