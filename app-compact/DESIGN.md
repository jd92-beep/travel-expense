---
name: Travel Ledger · 沿途
description: Illustrated travel planning with a clear, accessible expense ledger.
colors:
  accent: "#286774"
  on-accent: "#ffffff"
  ground: "#f4f8f7"
  surface: "#ffffff"
  ink: "#203f44"
  muted: "#576f73"
  rule: "#d5e2e2"
  tint: "#e5eff0"
  danger: "#ae3d48"
  dark-accent: "#9cced3"
  dark-on-accent: "#18373c"
  dark-ground: "#14272c"
  dark-surface: "#20383e"
  dark-ink: "#edf5f4"
  dark-muted: "#b7cdcf"
  dark-rule: "#3f5a60"
  dark-tint: "#29494f"
  dark-danger: "#ffb5ba"
typography:
  display:
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Avenir Next, PingFang TC, Microsoft JhengHei, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  field:
    fontFamily: "Avenir Next, PingFang TC, Microsoft JhengHei, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Avenir Next, PingFang TC, Microsoft JhengHei, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  chip: "6px"
  field: "8px"
  control: "10px"
  calendar: "12px"
  surface: "14px"
  dock-item: "18px"
  dialog: "20px"
  dock: "24px"
spacing:
  step-4: "4px"
  step-8: "8px"
  step-12: "12px"
  step-16: "16px"
  step-20: "20px"
  step-24: "24px"
  step-28: "28px"
  step-32: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
  mobile-navigation:
    rounded: "{rounded.dock}"
    padding: "6px"
    height: "auto"
  departure-chip:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.accent}"
    padding: "5px 10px"
    rounded: "{rounded.chip}"
  content-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  selected-day:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
---
# Design System: Travel Ledger · 沿途

## Overview

**Creative North Star: "沿途 — Lakeside Journey"**

The Compact client uses an illustrated lakeside travel world: mineral teal controls, tinted neutral surfaces, readable Traditional Chinese, and landscape artwork. It keeps dense itinerary and expense information on opaque surfaces, with translucent treatment reserved for floating navigation.

This records the implemented 0.33.0 design and supersedes the earlier Epic Glass Field identity. The palette primitives describe the automatic Journey appearance. Explicit regional and style themes retain their selected palettes through the shared layout; their definitions remain in the theme catalogue.

The implementation sources are [Journey styles](src/styles/journey.css), [theme definitions](src/theme/tripTheme.tsx), [the shell](src/components/Shell.tsx), and [Journey components](src/components/journey/). Follow the final cascade in the stylesheet; older declarations and preview styles are compatibility layers, not additional design directions.

**Key Characteristics:**

- Bundled landscape illustration, with readable text outside the artwork.
- Shared day selection across the trip overview and planner.
- Open groups and ruled rows, with containers for bookings, forms and data panels.
- Equal mobile navigation targets and a persistent desktop rail.

## Colors

The automatic palette pairs lake teal with pale green-grey ground and deep petrol ink. The dark counterpart uses layered petrol surfaces and a pale teal action color. The frontmatter is the primitive reference; the sidecar's synthesized tonal ramps are preview metadata, not additional runtime tokens.

### Primary

Accent identifies actions, selected dates and selected navigation. On-accent provides their readable foreground. Tint groups quieter selections and supporting controls.

### Neutral

Ground forms the page, surface carries opaque content, ink carries primary text, muted carries supporting text, and rule separates rows. Avoid reducing the opacity of muted text: the chosen foreground already supplies the hierarchy.

### Semantic

Danger marks destructive controls and error feedback. Existing data visualizations and status components retain their semantic theme tokens; do not turn category or status colors into unrelated decorative accents.

**The Palette Ownership Rule.** Use Journey roles for new surfaces. When the user selects a manual theme, resolve those roles from that theme instead of hardcoding teal.

## Typography

The current body uses the Avenir Next / PingFang TC stack in the frontmatter. It pairs humanist Latin shapes with native Traditional Chinese glyphs; no font download is needed for that stack. Headings currently inherit this native stack; a distinct display face remains unestablished. Manual style kits may supply their existing fonts.

Use the display role for the trip title, headline for section entrances, title for data panels, body for regular copy, field for editable text, and label for compact controls. The phone trip title is 28px, reducing to 26px on short phones; desktop uses the display role. Timeline item names are 17px, supporting descriptions 14px, and times 12px. These are the established component exceptions, not a reason to add new sizes. Headings use balanced wrapping and the frontmatter tracking; numbers in time, amount and date components are tabular.

**The Reading Order Rule.** Use size and weight to distinguish the task heading, actionable content and supporting metadata; keep times and amounts in tabular numerals.

## Layout

The shared content container is at most 1180px. Phone content uses 20px horizontal insets, reduced to 16px at widths of 380px or less; desktop uses 32px. The desktop rail appears at 768px, with a 216px width; at 1440px it widens to 248px. The fixed mobile dock has 16px side offsets and a bottom offset that respects the safe area. Its height grows with its labels from a 72px minimum, including at increased text sizes. Content reserves 112px below it; desktop reserves 56px.

Use the spacing scale to keep related labels and controls close, then separate groups with 24–32px breaks. Calendar columns and planner tabs scroll horizontally inside their own containers. Booking cards form two columns on desktop. Statistics uses its wider two-column arrangement at 900px. The mobile route diagram is a vertical sequence with a continuous line and numbered nodes; it is explicitly labelled as stop order.

The Home image is 160px high on phones, 260px from the desktop breakpoint and 300px at the wide breakpoint. On phones no taller than 740px it becomes 112px; date buttons reduce from an 80px minimum to 64px. These height adaptations expose useful itinerary content without shrinking the controls. Planner cover strips use 64px and are omitted in schedule, calendar and route views.

## Elevation & Depth

Content separates through tone, whitespace and rules. General content cards have one subtle border and no shadow. The mobile dock uses a restrained offset shadow and translucent surface with an 18px blur; trip menus and modal sheets use offset shadows to express their temporary layer. The header and trip menu sit above sticky ledger controls at layer 1100 and below modal dialogs. The exact shadow values live in the sidecar.

**The Navigation Glass Rule.** Keep content opaque. Reserve translucent blur for the floating navigation layer and the backdrop behind its sheet.

## Shapes

Use the frontmatter radius roles: fields are compact, controls are gently rounded, and content panels and landscape frames use the surface radius. The floating dock has the broadest corners, with smaller concentric selected targets. Date buttons have rounded upper corners when unselected and fully rounded selection. Route nodes are circles because they represent ordered stops. Booking references use a dashed separator to reinforce the ticket structure.

## Components

### Buttons and fields

Primary buttons use accent and on-accent; secondary buttons use an outlined transparent surface; danger buttons use the danger role. They have a 44px minimum height, 14px semibold labels and a 10px-by-16px padding pair. Icon actions expose an accessible label. Standard inputs use opaque surfaces, a rule-colored border and 16px text to remain comfortable on mobile; the embedded History search field currently uses 14px text. Keyboard focus uses a 3px accent outline with a 3px offset. Disabled controls reduce opacity to 0.52; completed game cards retain full opacity.

### Navigation

Phone navigation has five equal targets: 主頁、行程、記帳、紀錄、更多. More opens a labelled, focus-managed sheet for 天氣、統計、設定. The fifth target displays the current secondary section while retaining the More action. Desktop exposes all seven sections in the rail. The active target uses tint and accent; the inactive targets use muted ink. Keep every label paired with a consistent stroke icon, without a raised central capture button.

### Day rail and planner

The 0.34 connected planner takes its structure from the first supplied recording: a compact date ruler with a moving train marker, warm segmented Day / Multi-day / Map controls, outlined activity panels, pastel category roles and a sliding tools sheet. The second recording supplies the landscape atmosphere. Selected date and place persist across planner views. Calendar headers remain pinned within a scrollable hour grid; full activity details appear in the linked map panel.


Selected days use accent and on-accent with `aria-pressed`. Selecting a date scrolls the rail itself to keep that selection visible; it does not scroll the page. Reduced motion makes this positioning instant. Planner modes reuse the same selected date and show their own clear actions. The game uses a short state transition; there is no idle scene animation.

### Cards, rows and feedback

Bookings, calendar days and inline forms earn containers because each is a distinct editable object. Expense and checklist rows use alignment and separators. Itinerary activities use outlined blocks within a day grouping to match the explicitly requested first-video structure; this is a deliberate exception to the default unboxed-row rule. Checklist completion includes both a checkbox and strike-through, and feedback uses explicit text rather than color alone. Search icons occupy a separate aligned slot; text never starts beneath the icon. Trip and booking titles wrap instead of forcing a wider viewport. Small status badges have compact corners and pair color with text; the sync badge stays anchored to its control. Release notes use the same opaque panel treatment, with unboxed text groups and a clear dismissal action.

### Landscape and mark

The two bundled WebP covers are thematic travel illustrations, selected from the trip's Japan context or the general alpine alternative. They are not destination photographs. Keep the alt text honest and the operational copy outside the image. The geometric mountain-and-path Journey mark and Lucide icons supply the compact identity on utility screens.

## Do's and Don'ts

### Do:

- **Do** use the shared Journey color roles, including their manual-theme mappings.
- **Do** keep text outside the landscape image and describe the image as illustration.
- **Do** preserve clear keyboard focus, selected states, visible errors and reduced-motion behavior.
- **Do** use Lucide stroke icons and the existing geometric Journey mark.
- **Do** let long content wrap or scroll within its own rail without widening the page.

### Don't:

- **Don't** restore ambient particles, gradient headings, repeated reveal entrances or decorative stamp effects to the default Journey world.
- **Don't** use a card around every row or put glass effects on content cards.
- **Don't** imply that a route-order diagram is a geographic map or that itinerary flight details are live status.
- **Don't** replace a user-selected palette with the default palette.
