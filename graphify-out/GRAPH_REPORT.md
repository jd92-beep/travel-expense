# Graph Report - /Users/tommy/Documents/New project/travel-expense  (2026-05-04)

## Corpus Check
- 93 files · ~105,678 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 439 nodes · 513 edges · 69 communities detected
- Extraction: 76% EXTRACTED · 22% INFERRED · 1% AMBIGUOUS · INFERRED: 111 edges (avg confidence: 0.77)
- Token cost: 161,794 input · 82,784 output

## Community Hubs (Navigation)
- [[_COMMUNITY_React App Shell|React App Shell]]
- [[_COMMUNITY_Receipt Data Flow|Receipt Data Flow]]
- [[_COMMUNITY_App3 UI Shell|App3 UI Shell]]
- [[_COMMUNITY_Timeline Logic|Timeline Logic]]
- [[_COMMUNITY_Scan Settings Docs|Scan Settings Docs]]
- [[_COMMUNITY_Notion Weather APIs|Notion Weather APIs]]
- [[_COMMUNITY_Shared UI Primitives|Shared UI Primitives]]
- [[_COMMUNITY_Legacy Actions|Legacy Actions]]
- [[_COMMUNITY_Itinerary Helpers|Itinerary Helpers]]
- [[_COMMUNITY_Gemini Scan Modal|Gemini Scan Modal]]
- [[_COMMUNITY_App3 Scan Flow|App3 Scan Flow]]
- [[_COMMUNITY_Persistent State Vault|Persistent State Vault]]
- [[_COMMUNITY_Settings Vault|Settings Vault]]
- [[_COMMUNITY_Favicon Branding|Favicon Branding]]
- [[_COMMUNITY_React Asset|React Asset]]
- [[_COMMUNITY_Vite Asset|Vite Asset]]
- [[_COMMUNITY_Toast Modals|Toast Modals]]
- [[_COMMUNITY_Social Icon Sprite|Social Icon Sprite]]
- [[_COMMUNITY_Hero Visual System|Hero Visual System]]
- [[_COMMUNITY_App Icon Branding|App Icon Branding]]
- [[_COMMUNITY_Storage Persistence|Storage Persistence]]
- [[_COMMUNITY_History Editing|History Editing]]
- [[_COMMUNITY_State Hook|State Hook]]
- [[_COMMUNITY_App3 Bootstrap|App3 Bootstrap]]
- [[_COMMUNITY_Legacy PWA Overview|Legacy PWA Overview]]
- [[_COMMUNITY_Tab Navigation|Tab Navigation]]
- [[_COMMUNITY_Stats Filters|Stats Filters]]
- [[_COMMUNITY_Deno Proxy CORS|Deno Proxy CORS]]
- [[_COMMUNITY_Itinerary Timeline|Itinerary Timeline]]
- [[_COMMUNITY_Cursor Glow|Cursor Glow]]
- [[_COMMUNITY_Countdown Card|Countdown Card]]
- [[_COMMUNITY_Receipt Card|Receipt Card]]
- [[_COMMUNITY_Ambient Theme|Ambient Theme]]
- [[_COMMUNITY_Sparkline Chart|Sparkline Chart]]
- [[_COMMUNITY_Animated Numbers|Animated Numbers]]
- [[_COMMUNITY_Empty State|Empty State]]
- [[_COMMUNITY_Card Labels|Card Labels]]
- [[_COMMUNITY_Modal Keyboard|Modal Keyboard]]
- [[_COMMUNITY_Dashboard Animation|Dashboard Animation]]
- [[_COMMUNITY_App3 CSV Export|App3 CSV Export]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_React Entry|React Entry]]
- [[_COMMUNITY_Dashboard Tab|Dashboard Tab]]
- [[_COMMUNITY_Stats Tab|Stats Tab]]
- [[_COMMUNITY_History Tab|History Tab]]
- [[_COMMUNITY_Budget Ring|Budget Ring]]
- [[_COMMUNITY_Success Flash|Success Flash]]
- [[_COMMUNITY_Tab Bar Component|Tab Bar Component]]
- [[_COMMUNITY_Button Component|Button Component]]
- [[_COMMUNITY_Type Models|Type Models]]
- [[_COMMUNITY_Constants|Constants]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_App3 Vite Config|App3 Vite Config]]
- [[_COMMUNITY_App3 Stats Tab|App3 Stats Tab]]
- [[_COMMUNITY_Toast Component|Toast Component]]
- [[_COMMUNITY_App3 Tab Bar|App3 Tab Bar]]
- [[_COMMUNITY_Modal Component|Modal Component]]
- [[_COMMUNITY_App3 Types|App3 Types]]
- [[_COMMUNITY_App3 Constants|App3 Constants]]
- [[_COMMUNITY_Project Context|Project Context]]
- [[_COMMUNITY_Legacy Technical Debt|Legacy Technical Debt]]
- [[_COMMUNITY_Fintech Design Theme|Fintech Design Theme]]
- [[_COMMUNITY_Typography System|Typography System]]
- [[_COMMUNITY_Feature Inventory|Feature Inventory]]
- [[_COMMUNITY_Currency Formatters|Currency Formatters]]
- [[_COMMUNITY_Receipt Sorting|Receipt Sorting]]
- [[_COMMUNITY_App3 Itinerary Lookup|App3 Itinerary Lookup]]

## God Nodes (most connected - your core abstractions)
1. `Receipt domain object` - 18 edges
2. `Receipt category vocabulary` - 12 edges
3. `AppState persisted application model` - 10 edges
4. `App3 animated tab shell` - 10 edges
5. `notionPushReceipt()` - 9 edges
6. `notionPullAll()` - 9 edges
7. `Payment method vocabulary` - 9 edges
8. `Notion schema resolution push pull and deletion sync` - 8 edges
9. `Open-Meteo Japan forecast fetcher` - 8 edges
10. `fetch()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `React receipt save delete Notion sync boundary` --semantically_similar_to--> `Notion schema resolution push pull and deletion sync`  [INFERRED] [semantically similar]
  app/src/App.tsx → index.html
- `docs shared state model` --semantically_similar_to--> `AppState persisted application model`  [INFERRED] [semantically similar]
  docs/README.md → app/src/lib/types.ts
- `docs cross-tab function map` --semantically_similar_to--> `scan confirm and save receipt flow`  [INFERRED] [semantically similar]
  docs/README.md → app3/src/tabs/Scan.tsx
- `docs sync architecture and security model` --rationale_for--> `Password unlock for encrypted credential vault`  [INFERRED]
  docs/README.md → app/src/lib/vault.ts
- `Weather edge cases and limitations` --rationale_for--> `Open-Meteo Japan forecast fetcher`  [INFERRED]
  docs/weather.md → app/src/lib/weather.ts

## Hyperedges (group relationships)
- **Receipt capture normalizes into local state and optional Notion sync** — index_scan_receipt_flow, index_multi_provider_ocr_chain, index_email_parser_flow, index_booking_normalization, index_state_model, index_notion_sync [INFERRED 0.86]
- **Non-sensitive settings sync through Notion meta row while credentials stay local** — index_encrypted_vault_gate, index_notion_settings_meta_row, index_notion_sync, index_local_storage_persistence, readme_security_policy [INFERRED 0.84]
- **React renovation presents new UI while sharing legacy travel data** — app_readme_react_renovation, app_readme_shared_storage, app_react_shell, app_tab_routing, index_local_storage_persistence [INFERRED 0.80]
- **receipt_scan_to_persistence_flow** — scan_modal_handle_file, scan_file_to_base64, scan_prepare_for_ocr, scan_scan_receipt, scan_normalize_scan, scan_modal_build_initial_receipt, receipt_form_receipt_form, use_app_state_receipt_mutations, storage_save_state, types_receipt [INFERRED 0.88]
- **notion_receipt_sync_contract** — types_receipt, constants_notion_contract, notion_schema_cache, notion_build_props, notion_push_receipt, notion_pull_all, notion_archive_page [INFERRED 0.86]
- **trip_context_weather_region_flow** — itinerary_itinerary, itinerary_hk_time_helpers, itinerary_trip_status, itinerary_region_lookup, weather_fetch_weather, constants_weather_defaults, types_itinerary_day, types_weather_day [INFERRED 0.78]
- **Receipt lifecycle across capture, review, summary, and export** — scan_receipt_capture_flow, history_grouped_receipts, stats_receipt_aggregations, settings_data_management, dashboard_today_receipts [INFERRED 0.88]
- **Trip context reused for dashboard, itinerary timeline, and weather** — dashboard_itinerary_carousel, itinerary_component, itinerary_live_now_indicator, weather_itinerary_forecast [INFERRED 0.84]
- **App3 mobile shell pattern combines animated routing, bottom navigation, and transient feedback** — main_react_mount, app_app3_shell, app_tab_direction_model, tabbar_bottom_navigation, toast_feedback_layer [EXTRACTED 1.00]
- **Camera/gallery receipt creation pipeline** — scan_file_to_gemini_flow, gemini_image_to_base64, gemini_scan_with_gemini, scan_confirm_receipt_flow, use_app_state_use_app_state, storage_local_storage_persistence [INFERRED 0.86]
- **Settings integration control plane** — settings_vault_unlock_flow, vault_unlock_vault, settings_notion_push_all_flow, notion_push_receipt, settings_csv_export_flow, csv_export_csv [INFERRED 0.84]
- **Receipt consumption views** — types_receipt, dashboard_dashboard_tab, history_history_tab, stats_stats_tab, constants_categories [INFERRED 0.87]
- **chunk05_itinerary_dependency** — stats_render_stats, timeline_render_timeline, weather_render_weather, timeline_schedule_spots, weather_weather_coords_for_day [EXTRACTED 1.00]
- **chunk05_read_only_tabs** — stats_stats_tab, timeline_timeline_tab, weather_weather_tab, stats_state_receipts, weather_public_api_privacy [EXTRACTED 1.00]
- **chunk05_time_sensitive_ui** — timeline_hkt_now_key, timeline_resize_and_interval, weather_live_slot, weather_timezone_assumption [EXTRACTED 1.00]
- **icon_identity_composition** — rounded_square_background, warm_currency_gradient, white_sheen_overlay, yen_currency_symbol, expense_tracking_identity [INFERRED]
- **favicon_visual_composition** — lightning_bolt_logo_shape, purple_base_fill, alpha_shape_mask, blurred_ellipse_glows [INFERRED]
- **internal_lighting_palette** — light_lavender_highlights, deep_violet_shadows, cyan_energy_accents, gaussian_blur_filters [INFERRED]
- **ui_asset_brand_role** — favicon_svg_asset, lightning_bolt_logo_shape, travel_expense_brand_identity [INFERRED]
- **External Links Icon Set** — icons_bluesky_icon, icons_discord_icon, icons_documentation_icon, icons_github_icon, icons_social_icon, icons_x_icon [EXTRACTED 1.00]
- **Stacked App Interface Composition** — hero_floating_dark_panel, hero_purple_base_layer, hero_center_white_card, hero_vertical_alignment_guides [EXTRACTED 1.00]
- **react_svg_icon_rendering_contract** — react_svg_asset, svg_root_element, react_logo_path, react_cyan_fill, fixed_icon_dimensions, viewbox_coordinate_system, centered_aspect_ratio [INFERRED]
- **react_svg_semantic_accessibility_bundle** — svg_root_element, iconify_logo_classes, hidden_img_accessibility, react_atom_visual_motif [INFERRED]
- **vite_logo_visual_composition** — purple_lightning_mark, alpha_mask_a, masked_gradient_highlights, blur_filter_defs [INFERRED]
- **vite_logo_accessible_asset** — vite_svg_asset, vite_logo_title, parenthesis_marks, dark_mode_style [INFERRED]

## Communities

### Community 0 - "React App Shell"
Cohesion: 0.04
Nodes (48): Time-of-day ambient background theme, React app HTML shell, React receipt save delete Notion sync boundary, React App shell and providers, Legacy features pending in React port, React 2.0 renovation scope, React app shares legacy localStorage key, React animated tab routing (+40 more)

### Community 1 - "Receipt Data Flow"
Cohesion: 0.08
Nodes (42): Receipt category vocabulary, ITINERARY, Notion proxy, version and property mapping contract, Payment method vocabulary, Browser CSV download helper, exportCSV, Receipt list to Excel-compatible CSV, Dashboard tab (+34 more)

### Community 2 - "App3 UI Shell"
Cohesion: 0.07
Nodes (41): App3 animated tab shell, Tab transition direction model, App3 animated button primitive, App3 glass card primitive, Budget summary and daily trend, Dashboard tab, Six-day itinerary carousel, Breathing scan call to action (+33 more)

### Community 3 - "Timeline Logic"
Cohesion: 0.09
Nodes (29): Weather location defaults and weather code map, state.receipts[], CSS variable metro progress bar, Timeline edge cases and limitations, HKT-derived nowKey, state.itineraryOverrides, renderTimeline(), Resize debounce and 5-minute interval (+21 more)

### Community 4 - "Scan Settings Docs"
Cohesion: 0.09
Nodes (24): SCAN_MODELS, imageToBase64, scanWithGemini, docs cross-tab function map, scan confirm and save receipt flow, Scan docs rationale, file image to Gemini OCR flow, manual receipt entry flow (+16 more)

### Community 5 - "Notion Weather APIs"
Cohesion: 0.17
Nodes (14): fetch(), buildProperties(), buildProps(), ensureSchema(), extractText(), findByName(), headers(), makeProxyUrl() (+6 more)

### Community 6 - "Shared UI Primitives"
Cohesion: 0.1
Nodes (10): Badge(), Button(), Button click and touch ripple integration, Card(), CardLabel compact metadata label, submit(), useRipple pointer-origin animation hook, useRipple() (+2 more)

### Community 7 - "Legacy Actions"
Cohesion: 0.14
Nodes (8): toast(), downloadCSV(), receiptsToCSV(), getRegionForDate(), addAndRegion(), pullNotion(), doUnlock(), exportCSV()

### Community 8 - "Itinerary Helpers"
Cohesion: 0.18
Nodes (9): currentDay(), dayNumberFor(), daysBetween(), todayHK(), tripStatus(), callGeminiOnce(), fetchWithTimeout(), normalizeScan() (+1 more)

### Community 9 - "Gemini Scan Modal"
Cohesion: 0.17
Nodes (15): Gemini vision scan model chain, Modal overlay and escape-close behavior, ReceiptEditModal edit/delete wrapper, Single Gemini generateContent OCR request, FileReader image to base64 conversion, Gemini receipt OCR prompt contract, Gemini structured output schema, Image file to OCR scan handler (+7 more)

### Community 10 - "App3 Scan Flow"
Cohesion: 0.19
Nodes (6): imageToBase64(), scanWithGemini(), getCurrentDay(), todayHKT(), handleFile(), openManual()

### Community 11 - "Persistent State Vault"
Cohesion: 0.27
Nodes (11): docs shared state model, settings vault unlock flow, Default persisted app state, localStorage app state loader, localStorage persistence, localStorage app state saver, AppState persisted application model, useAppState persistent app state hook (+3 more)

### Community 12 - "Settings Vault"
Cohesion: 0.29
Nodes (5): handleNotionPushAll(), handleVaultUnlock(), b64d(), deriveKey(), unlockVault()

### Community 13 - "Favicon Branding"
Cohesion: 0.22
Nodes (10): Alpha shape mask, Blurred ellipse glows, Cyan energy accents, Deep violet shadows, Favicon SVG asset, Gaussian blur filters, Light lavender highlights, Lightning bolt logo shape (+2 more)

### Community 14 - "React Asset"
Cohesion: 0.22
Nodes (10): Centered aspect ratio, Fixed icon dimensions, Hidden image accessibility, Iconify logo classes, React atom visual motif, React cyan fill, React logo path, React SVG asset (+2 more)

### Community 15 - "Vite Asset"
Cohesion: 0.25
Nodes (8): Alpha mask a, Gaussian blur filter definitions, Dark mode style, Masked gradient highlights, Responsive parenthesis marks, Purple lightning mark, Vite, Vite SVG asset

### Community 16 - "Toast Modals"
Cohesion: 0.29
Nodes (3): ReceiptEditModal(), ScanModal(), useToast()

### Community 17 - "Social Icon Sprite"
Cohesion: 0.29
Nodes (7): Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Generic Social Icon, Social Icon Sprite Sheet, X Icon

### Community 18 - "Hero Visual System"
Cohesion: 0.38
Nodes (7): App Scan Visual Metaphor, Center White Card, Floating Dark Panel, Layered Hero Illustration, Premium Tech Branding, Purple Base Layer, Vertical Alignment Guides

### Community 19 - "App Icon Branding"
Cohesion: 0.4
Nodes (6): App icon SVG, Expense tracking identity, Rounded square background, Warm currency gradient, White sheen overlay, Yen currency symbol

### Community 20 - "Storage Persistence"
Cohesion: 0.67
Nodes (2): loadState(), saveState()

### Community 21 - "History Editing"
Cohesion: 0.5
Nodes (0): 

### Community 22 - "State Hook"
Cohesion: 0.67
Nodes (1): useAppState()

### Community 23 - "App3 Bootstrap"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Legacy PWA Overview"
Cohesion: 0.67
Nodes (3): Legacy single-file HTML architecture, Legacy PWA single HTML app, Mobile-first travel expense tracker product overview

### Community 25 - "Tab Navigation"
Cohesion: 0.67
Nodes (3): TabBar bottom navigation, TabId navigation contract, Tab activation particle feedback

### Community 26 - "Stats Filters"
Cohesion: 0.67
Nodes (3): Flight and hotel exclusion filter, Notion settings sync for TOP 10 toggle, TOP 10 include big items toggle

### Community 27 - "Deno Proxy CORS"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Itinerary Timeline"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Cursor Glow"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Countdown Card"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Receipt Card"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Ambient Theme"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Sparkline Chart"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Animated Numbers"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Empty State"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Card Labels"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Modal Keyboard"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Dashboard Animation"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "App3 CSV Export"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "PostCSS Config"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "React Entry"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Dashboard Tab"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Stats Tab"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "History Tab"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Budget Ring"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Success Flash"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Tab Bar Component"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Button Component"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Type Models"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Constants"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "ESLint Config"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "App3 Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "App3 Stats Tab"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Toast Component"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "App3 Tab Bar"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Modal Component"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "App3 Types"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "App3 Constants"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Project Context"
Cohesion: 1.0
Nodes (1): Nagoya travel expense project context

### Community 62 - "Legacy Technical Debt"
Cohesion: 1.0
Nodes (1): Known legacy limitations and technical debt

### Community 63 - "Fintech Design Theme"
Cohesion: 1.0
Nodes (1): Revolut-inspired fintech design theme

### Community 64 - "Typography System"
Cohesion: 1.0
Nodes (1): Aeonik and Inter typography hierarchy

### Community 65 - "Feature Inventory"
Cohesion: 1.0
Nodes (1): Current product feature inventory

### Community 66 - "Currency Formatters"
Cohesion: 1.0
Nodes (1): JPY and HKD display formatters

### Community 67 - "Receipt Sorting"
Cohesion: 1.0
Nodes (1): Receipt chronological sort helper

### Community 68 - "App3 Itinerary Lookup"
Cohesion: 1.0
Nodes (1): current itinerary day lookup

## Ambiguous Edges - Review These
- `Universal pill button styling` → `React 2.0 renovation scope`  [AMBIGUOUS]
  DESIGN.md · relation: conceptually_related_to
- `Gemini vision scan model chain` → `Default persisted app state`  [AMBIGUOUS]
  app/src/lib/storage.ts · relation: conceptually_related_to
- `Dashboard tab` → `App3 animated tab shell`  [AMBIGUOUS]
  app3/src/App.tsx · relation: semantically_similar_to
- `History tab` → `App3 animated tab shell`  [AMBIGUOUS]
  app3/src/App.tsx · relation: semantically_similar_to
- `Scan tab` → `App3 animated tab shell`  [AMBIGUOUS]
  app3/src/App.tsx · relation: semantically_similar_to
- `Settings tab` → `App3 animated tab shell`  [AMBIGUOUS]
  app3/src/App.tsx · relation: semantically_similar_to
- `Stats tab` → `App3 animated tab shell`  [AMBIGUOUS]
  app3/src/App.tsx · relation: semantically_similar_to

## Knowledge Gaps
- **95 isolated node(s):** `Nagoya travel expense project context`, `Legacy single-file HTML architecture`, `Travel expense state model`, `Receipt object and split semantics`, `Independent AI model catalogs for scan voice email` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Deno Proxy CORS`** (2 nodes): `corsResponse()`, `kimi-proxy-deno.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Itinerary Timeline`** (2 nodes): `Itinerary.tsx`, `timeToFraction()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cursor Glow`** (2 nodes): `CursorGlow.tsx`, `CursorGlow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Countdown Card`** (2 nodes): `CountdownCard.tsx`, `CountdownCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Receipt Card`** (2 nodes): `ReceiptCard.tsx`, `ReceiptCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ambient Theme`** (2 nodes): `getTimeTheme()`, `AmbientBackground.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sparkline Chart`** (2 nodes): `Sparkline.tsx`, `Sparkline()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Animated Numbers`** (2 nodes): `NumberRoll.tsx`, `NumberRoll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty State`** (2 nodes): `EmptyState.tsx`, `EmptyState()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Card Labels`** (2 nodes): `Card.tsx`, `CardLabel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modal Keyboard`** (2 nodes): `Modal.tsx`, `onKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dashboard Animation`** (2 nodes): `Dashboard.tsx`, `AnimatedNumber()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App3 CSV Export`** (2 nodes): `csv.ts`, `exportCSV()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Config`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `React Entry`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dashboard Tab`** (1 nodes): `Dashboard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Stats Tab`** (1 nodes): `Stats.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `History Tab`** (1 nodes): `History.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Budget Ring`** (1 nodes): `BudgetRing.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Success Flash`** (1 nodes): `SuccessFlash.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tab Bar Component`** (1 nodes): `TabBar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Button Component`** (1 nodes): `Button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Type Models`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Constants`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ESLint Config`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App3 Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App3 Stats Tab`** (1 nodes): `Stats.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Toast Component`** (1 nodes): `Toast.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App3 Tab Bar`** (1 nodes): `TabBar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modal Component`** (1 nodes): `Modal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App3 Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App3 Constants`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Project Context`** (1 nodes): `Nagoya travel expense project context`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Legacy Technical Debt`** (1 nodes): `Known legacy limitations and technical debt`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Fintech Design Theme`** (1 nodes): `Revolut-inspired fintech design theme`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Typography System`** (1 nodes): `Aeonik and Inter typography hierarchy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Feature Inventory`** (1 nodes): `Current product feature inventory`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Currency Formatters`** (1 nodes): `JPY and HKD display formatters`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Receipt Sorting`** (1 nodes): `Receipt chronological sort helper`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App3 Itinerary Lookup`** (1 nodes): `current itinerary day lookup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Universal pill button styling` and `React 2.0 renovation scope`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Gemini vision scan model chain` and `Default persisted app state`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Dashboard tab` and `App3 animated tab shell`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `History tab` and `App3 animated tab shell`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Scan tab` and `App3 animated tab shell`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Settings tab` and `App3 animated tab shell`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Stats tab` and `App3 animated tab shell`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._