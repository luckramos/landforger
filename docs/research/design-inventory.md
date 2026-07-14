---
title: LandForger Claude Design project — full inventory
date: 2026-07-13
source: Claude Design project "LandForger" (c1e152f0-4870-4b24-b9c2-002a808e6563)
ticket: https://github.com/luckramos/landforger/issues/2
---

# LandForger design inventory

Read via the DesignSync tool. Primary sources are the five `.dc.html` screen files; the `screenshots/` PNGs are cited only as secondary confirmation. `support.js` is the design-tool runtime (renders `<x-dc>` markup + the `DCLogic` React-like class) and `image-slot.js` is a reusable user-fillable image placeholder — both are prototype scaffolding, not product features.

**How the `.dc` files are built:** each screen is a single HTML file with all CSS inline in `style=` attributes plus a small `@keyframes` block in `<helmet><style>`, and one React-like `Component extends DCLogic` class in a `data-dc-script` tag that returns bindings for `{{ … }}` placeholders. `sc-if`/`sc-for` are conditionals/loops; `style-hover`/`style-focus`/`style-active` are pseudo-state styles; `data-props` exposes designer-tunable props.

---

## 1. Navigation flows (routing)

Navigation is plain `window.location.href` between files, with query params only on the Maps screen:

| From → To | Trigger | Source |
|---|---|---|
| Auth → Worlds | submit (after 780 ms burst) | `LandForger-Auth.dc.html` `submit()` |
| Worlds → Dashboard | click world card | `LandForger-Worlds.dc.html` `enterWorld()` |
| Dashboard → Worlds | "‹ Worlds" back button | `LandForger-Dashboard.dc.html` header `<a href>` |
| Dashboard → Maps | sidebar "World map" / "See on map" (`?page=<id>`) | `openMap()` / `seeOnMap()` (~line 1198) |
| Maps → Dashboard | pin "Open full page" / era "Open era page" — both pass `?page=<id>` | `LandForger-Maps.dc.html` `navToPage()` / `openEraPage()` |
| UserMenu → Worlds | "Sair" (logout) | `UserMenu.dc.html` `logout()` |

- **Maps parses deep links**: `?page=<id>` finds the map holding that page's pin, selects it, and switches the active era if the pin isn't in the current one; `?map=<id>` opens a map directly (`Maps` constructor, `URLSearchParams` block).
- **Gap:** the Dashboard does **not** parse `?page=` even though Maps navigates with it (0 occurrences of `URLSearchParams` in the Dashboard file). The React app needs real routes for world / page / maps / views.

## 2. Screen-by-screen

### 2.1 Auth (`LandForger-Auth.dc.html`)

Split-screen, dark. **Image panel** (50%): `image-slot` hero ("Drop your cover art") over a procedural gradient + diagonal-hatch texture that slowly drifts (`lf-drift` 18s); logo + wordmark; mono eyebrow "Worldbuilding Studio"; serif tagline (prop, default "Chart the drowned coast, one vale at a time."). **Form panel** (50%): eyebrow / serif h1 / subtext, fields, submit, demo hint, mode toggle.

- **Login/signup toggle swaps the two panels** horizontally: both panels animate `translateX` 820 ms `cubic-bezier(.76,0,.24,1)`; copy re-renders per mode (`renderVals()` imgTransform/formTransform).
- **Staggered field entrance**: every `[data-stagger]` element replays `lf-fieldIn` 560 ms with 62 ms per-index delay on mount and on mode toggle (`replayForm()`).
- **Error shake**: form plays `lf-shake` 480 ms on validation failure (`shake()`); inline error row with icon.
- **Submit burst**: overlay with a 20 px dot scaling ×46 (`lf-burst` 720 ms), spinner (`lf-spin`), text "Entering your worlds…" / "Forging your account…", then navigates.
- States: show/hide password (eye icon), remember-me custom checkbox, "Forgot?" (noop), signup-only Name field + terms line ("Cartographer's Terms", "Privacy Charter").
- **Demo auth**: any credentials pass; prefilled `sera@landforger.io` / `saltandcinder`. Hint chip says "Demo build — any credentials sign you straight in."
- `prefers-reduced-motion` collapses all animation (global media query + `prefersReduced()` checks).

### 2.2 Worlds (`LandForger-Worlds.dc.html`)

Sticky glass header (wordmark, "Search worlds…" input filtering name+logline, UserMenu import). Greeting block: mono dateline (live date), serif "Welcome back, Sera.", subtext.

- **World grid** `repeat(auto-fill,minmax(320px,1fr))`: a dashed "Forge a new world" create card + world cards. Card = cover (radial gradients derived from the genre color via `color-mix`, hatch overlay, big serif initial, genre badge), name, 2-line-clamped logline, member initial-avatars (overlapping), "N entries", updated. Entrance `wf-cardIn` staggered 70 ms/card; hover = bronze border + glow.
- **Create modal** (`wf-modalIn` 320 ms over blurred scrim): name input (serif), premise textarea, **genre chips** (Fantasy 38, Science Fiction 255, Horror 350, Mystery 285, Historical 88, Mythic 150 — oklch hues) + "✎ Custom" with 8 color swatches and a native color input; **template** choice (Blank cosmos / Starter structure); right column = live card preview; Create disabled until named. Submit prepends the world in-memory.
- Demo worlds (`constructor.worlds`): **The Ninth Vale** (Fantasy, 142 entries, "2h ago", members SV/CA/HK), **Marrowmoor** (Horror, 58), **Aeon Drift** (Science Fiction, 89) — each with a full logline usable as fixture copy.

### 2.3 Dashboard — the wiki itself (`LandForger-Dashboard.dc.html`, 1954 lines)

World: **The Ninth Vale**. Root layout = sidebar + main column; internal SPA state `view: dashboard | page | create` plus `filterCat`/`filterTag` submodes; every view swap animates `lw-viewIn` (300 ms, keyed container ~line 229).

**Sidebar** (~lines 50–174): two widths — expanded 264 px and collapsed 68 px icon rail — crossfaded (opacity + width 260–300 ms). Contents: logo (+ world slug), collapse/expand, "+ New page", All pages + the 7 categories with counts, top-9 tag chips, bottom nav: **World map** (→ Maps), **Timeline**, **Graph view**, **Reference canvas**.

**Topbar** (~lines 180–225): "‹ Worlds", world crumb (label bug: says "Loreweave"), page crumb with category icon/color, search trigger ("Search the world… ⌘K"), fake save indicator (`markSaving()` pulses "Saving" for 1400 ms then "Saved"), and page-context buttons: **Timeline** chip (only if page has eras), **Map** chip (only if page pinned), connections graph (✳), **read-only toggle** (padlock; hides toolbar, disables affordances), **focus mode** (◎ — hides sidebar+header, `Esc`/"Exit focus" to leave), reference-canvas float button, UserMenu.

**Home view**: world title + serif intro, 7 category cards (stagger `lw-stagger` 45 ms/card; hover lift −3 px), "Recently edited" rows (hover slides padding-left 16→20 px).

**Category / tag list view**: icon+title+count header, 2-column grid of page cards (optional cover gradient, summary, tag chips).

**Page view** (~lines 296–433) — the editor surface:
- Optional 300 px cover (gradient placeholder) with fade-in; category eyebrow; serif 43 px title.
- **Tags row**: removable chips (× hidden in read-only), "+ tag" opens find-or-create popover (`lw-pop`).
- **Eras property row** (non-era pages; code comment calls it "frontmatter `era` property", line ~1060): era chips rendered as mention chips + remove ×, "+ era" popover listing remaining eras with date labels, "See on timeline →" chip. Purple era accent (`oklch(0.80 0.085 300)`).
- **Properties block**: portrait placeholder for characters; field rows label/value where values may be inline **mention chips** (e.g. Sera: Aliases, Age, Role, Affiliation→org, Origin→location; source `buildData()` ~line 1081); "+ add relation".
- **Body** (hardcoded mock, `renderBody()` ~line 1503): serif paragraphs with inline mention chips, H2, italic callout (✻), image figure with mono caption. **Mention chips** (`mentionEl()`) = icon+title pill; hover shows a **preview card** (title/category/summary/tags, viewport-aware positioning, `showHover()`); click navigates.
- **Composer**: blinking caret (`lw-caret`) + hint "Press / for blocks · @ to mention". **Slash menu** (~line 385): 15 block types — Text, H1, H2, H3, Bulleted, Numbered, To-do, Quote, Callout, Toggle, Divider, Image, Table, Code, Mention (`slashItems` ~line 1094) — with icon/label/desc rows; **`insertBlock()` is a stub** (closes menu, fakes save). **Mention menu**: search-all-pages popover; picked mentions append as chips.
- **Backlinks — "Mentioned in"** (~line 415): collapsible (caret rotates 90°), count badge, **grouped by category**, each row = source page + snippet (hand-authored for Sera, 5 entries, `backlinksData` ~line 1173). **Era pages compute backlinks live** = all pages assigned to that era (line ~1612). Confirmed by `screenshots/era-backlinks.png`.
- **Format toolbar**: floating pill, anchorable **top or bottom** (segmented control on the bar itself); undo/redo, block set (¶ H1 H2 H3), B I U S code highlight, link, @, bullet/ordered/task/quote. All toggles are state-only mock. Width tracks sidebar (`barSbW`).

**Create view** (~lines 440+ markup, `createSchemas` ~line 1112): "New page" category selector modal (7 tiles) → per-category form. Schemas (field key/label/type):
- characters: name, aliases, portrait(image), age, role, affiliations(relation→organizations), origin(relation→locations), tags, desc
- locations: name, type(select: City/Region/Building/Landmark/Wilds), cover(image), parent(relation→locations), inhabitants(relation→characters), tags, desc
- events: name, period(text "Fictional calendars welcome…"), participants(relation→any), place(relation→locations), consequences, tags
- stories: name, status(select: Draft/In progress/Complete), synopsis, cast(relation→characters), tags
- items: name, type(select: Artifact/Weapon/Material/Relic/Everyday), owner(relation→characters), origin(relation→locations), tags, desc
- eras: name, datelabel(free text), summary, tags
- organizations: name, type(select: Guild/Order/House/Cult/State), leader/hq/members(relations), tags

Relation fields open the mention picker **filtered by target category**. `submitCreate()` really creates only **era** pages (appends to timeline order); other categories just return home — creation is mocked.

**Spotlight search** (⌘K, ~line 1339): modal with fuzzy matcher (per-character scoring, consecutive-run bonus), per-char **highlight of matched letters**, results = pages + categories, keyboard navigation (↑↓/Enter/Esc).

**Reference canvas** (~lines 620–700 markup; handlers ~1268–1383): fullscreen **or floating window** (drag by header, resize corner, minimize) — a whiteboard: pan/zoom (wheel-to-cursor), dotted grid; tools = select/pan, **marquee multi-select**, pencil (quadratic-smoothed strokes), arrow, line, dashed line, **shape picker** (rect/rounded/circle/ellipse/diamond/triangle/pentagon/hexagon/star), text (double-click edit, auto-delete when empty), sticky note, eraser (segment-distance hit test), **laser pointer** (700 ms fading trail via rAF); 3-row color palette; items drag/resize with 8 px grid snap; Delete/Backspace removes selection, Esc clears. Seeded with 6 items (notes/images/link) themed to the world.

**Relationship graph** (~lines 700–791 markup; ~1385–1473): fullscreen or **floating dockable window** (same dock pattern as timeline; `graphDock`, drag/resize/minimize — `screenshots/graph-float.png`, `graph-full.png`). Two implementations:
- **Force-directed (active)**: `startSim()` — nodes revealed one-by-one (170 ms cadence ÷ motionScale), repulsion + edge springs + centering, node radius by degree, focal node pinned in local scope, **drag nodes** (physics resumes), hover dims non-neighbors, click opens the page, pan/zoom. Global scope = all pages seeded on a phyllotaxis spiral sorted by degree; local scope = page + direct neighbors on a ring (`graphLayout()`).
- **Star map (built but disabled)**: `GRAPH_STARMAP=false` (line ~1387) — constellation with drifting stars (`star-drift`), pulsing halos, gold "beacon" top-degree nodes, bowed comet-flow edges (`arrow-comet`), numbered star labels, and a **warp-out transition** on click before navigating. A product decision is needed on which mode ships.
- Edges = 26 authored directed links + auto-added page↔era links (`buildData()` ~1042–1078).

**Timeline** (~lines 791–919 markup; ~1217–1244 + 1844–1909): overlay, fullscreen or **floating dockable window** (`tlDock`, `screenshots/tl-float.png`). Header: count + subtitle, mode toggle **Timeline / Manage order** (`tl-manage.png`), occurrence prev/next when focused on a page ("n / m"), dock/minimize/close.
- **Timeline mode**: vertical rail of era nodes (purple dot + connecting lines), each = title, free-text date label, summary, page count, expand/collapse body listing member pages **grouped by category** (staggered 40 ms). Node entrance `tl-nodeIn` 55 ms stagger.
- **Focus flow**: "See on timeline" from a page opens the timeline, scrolls (custom eased `animateScroll`) to the first era containing it, **pulses** that era (`tl-glow`-style `firePulse`), and marks all its occurrence eras; ◀▶ cycles occurrences.
- **Drag-to-reorder eras** in both modes (pointer drag, live displacement of siblings, drop indicator line; strides 98/64 px — `tl-drag.png`).
- Empty state "No eras yet" + "Create first era" → era create form.
- **Persistence: `localStorage`** keys `lf_eraOrder`, `lf_eraByPage` (line ~1218) — the only real persistence in the prototype.
- Eras are an **ordered list**; no numeric dates/axis — date labels are free text.

Props: `motionScale` (0.5–1.5×) writes `--mo` used in `calc(var(--mo,1) * <ms>)` across all animations; `bodyFont` Serif/Sans switches the page body family (`bodyFam()`).

### 2.4 Maps (`LandForger-Maps.dc.html`, 894 lines)

Header: "‹ back" to Dashboard, **drill-path breadcrumbs** (nested maps), edit-layout toggle, add-pin, map-settings.

- **Stage**: pan (pointer drag) / zoom (wheel, buttons, reset; clamp 0.6–3.4); map image fills a 1600/1080 stage; **drill-down navigation**: pins with a `child` map show a bronze badge and the inspector offers "enter" — plays `mp-zoomIn` **from the pin's position** (`transformOrigin` = pin %), breadcrumb-up plays `mp-zoomOut` (`playAnim()` ~line 487).
- **Pins**: stored as % coordinates per map (`place`); category-colored circular marker (icon, tail, ring) that **counter-scales** against zoom so pins stay constant-size; label shown when selected (or `alwaysLabels` prop); selected pin pulses (`mp-pulse`). **Era filter: a pin renders only if `pin.eras` includes the active era** (render loop ~line 682). Edit mode: drag pins (clamped 2–98 %), add pin flow = page picker (search + category groups) → "placing" banner → click map to drop (defaults to **all** eras), remove placement. `toggleEra()` **refuses to remove the last era** — every pin belongs to ≥1 era; "always visible" is modeled as "member of all eras".
- **Inspector** (right drawer, `mp-slideR`): cover tinted by category, type/title/summary, "Pinned on N maps", **era membership checklist** (dots colored per era; editable in edit mode), actions: Open full page (→ Dashboard `?page=`), **docked reader** (side panel preview with "Open full page"), enter/create child map.
- **Era timeline dock** (bottom, collapsible `mp-tlOpen`): the 4 eras as dots on a rail with fill up to the active one, name + date label, click = set era → **crossfades** the map image when the map is era-linked (previous image stashed + `mp-eraFade`) and re-filters pins; each era row offers "Open era page" → **navBurst** (color burst overlay with the era name) then navigates.
- **Map settings popover**: per-map **"era-linked" toggle** — one image per era ("This map redraws each era") vs a single image ("One map · all eras") — plus per-slot **image upload** (`FileReader` → dataURL, crossfade on replace). This is the map-import flow.
- Data model (`constructor`): `maps{id,title,kind,locId,eraLinked,images{eraId|all}}`, `pins{id,pageId,child,eras[]}`, `place{mapId:[{pin,x,y}]}`. Demo: 4 maps — The Drowned Coast (world, era-linked, 4 images `maps/world-*.png`), The Ninth Vale (`vale.png`), Duskwater (`duskwater.png`), Ashthorn Keep floor plan (`keep.png`) — 12 pins, per-map placements (~lines 389–415).
- Props: `startEra` enum, `alwaysLabels` bool, `motionScale`.

### 2.5 UserMenu (`UserMenu.dc.html`)

Avatar button (initials, bronze gradient) → popover (`um-pop` 160 ms, position measured from the button rect): user block (name/email), items **"Perfil"** and **"Configurações"** (both `console.log` stubs — note the **Portuguese labels** while the rest of the UI is English), divider, **"Sair"** (red) → navigates to **Worlds** (arguably should be Auth). Imported by Worlds and Dashboard via `<dc-import name="UserMenu" …>`.

## 3. Design-system observations

- **Styling = 100 % inline styles.** No classes, no CSS-variable token sheet. The only custom properties are `--mo` (motion scale) and `--sc` (star color). De-facto tokens repeated literally everywhere:
  - Background `#080807`; panels `#100e0c` / `#0e0d0c` / `#181614`; text `rgba(245,241,234,α)`; accent bronze `#B0824A`; accent-light `#e6c79a`; hairlines `rgba(255,255,255,0.05–0.12)`.
  - **Category colors** (Dashboard `buildData()` ~line 1002): `oklch(0.80 0.085 H)` — stories 215, eras 300, characters 32, locations 152, items 92 (L 0.83), organizations 268 (L 0.79), events 332. Maps repeats the map (~line 479). Era rail colors in Maps: `oklch(0.78 0.12 H)` hues 298/276/250/34.
- **Fonts** (Google Fonts on every screen): Hanken Grotesk (UI sans), Newsreader (serif display + default body), IBM Plex Mono (labels/eyebrows/meta). `bodyFont` prop toggles body serif/sans.
- **Dark theme only; desktop only.** No light theme, no responsive media queries anywhere (the only media query is `prefers-reduced-motion`). Layouts assume ≥ ~1180 px, `100vh`, `overflow:hidden` shells.
- **Icons**: hand-drawn inline SVGs per category (built in JS, `mkIcon()`), plus unicode glyphs (◆ ✳ ▦ ⌕ ¶ ❝ …). Logo = layered SVG (mountain + moon + sparkles).
- **Motion system**: ~45 `@keyframes` across screens (Auth `lf-*` 8, Worlds `wf-*` 4, Dashboard `lw-*`/`tl-*`/`star-*`/`arrow-*` 21, Maps `mp-*` 11, UserMenu 1); house easing `cubic-bezier(.22,.61,.36,1)`; durations multiplied by `--mo`; plus substantial **JS-orchestrated motion** (stagger replays, shake, graph physics, eased scrolling, laser trail rAF, era pulse, image crossfades, navBurst, dock float↔full 340 ms geometry transitions). `prefers-reduced-motion` handled globally on every screen. A separate ticket (#3) measures these precisely.
- **Persistence**: only the timeline (`lf_eraOrder`, `lf_eraByPage` in localStorage). Everything else is in-memory; map uploads become dataURLs.

## 4. Demo world content (fixture material)

**Worlds**: The Ninth Vale · Fantasy · "A guild cartographer races the rising tide to recover the ninth map before the Order burns what is left of the drowned coast." (142 entries); Marrowmoor · Horror · fog-drowned heath / reliquary keeper (58); Aeon Drift · SF · generation ark that forgot its destination (89). Source: `LandForger-Worlds.dc.html` constructor.

**Dashboard pages** (17; id · category · title · tags · one-line summary, all present in `buildData()` ~line 1019):

| id | cat | title | tags |
|---|---|---|---|
| salt-cinder | stories | Salt & Cinder | novel, main (fields: Status "In progress") |
| sera | characters | Sera Valen | protagonist, cartographer, coastal (+fields: Aliases, Age 29, Role, Affiliation→guild, Origin→duskwater) |
| corin | characters | Corin Ashthorn | knight, exile |
| hollow-king | characters | The Hollow King | antagonist |
| duskwater | locations | Duskwater | coastal, city |
| ninth-vale | locations | The Ninth Vale | region |
| ashthorn-keep | locations | Ashthorn Keep | fortress |
| cartographers-guild | organizations | Cartographers' Guild | guild |
| order-ember | organizations | Order of the Ember | order, magic |
| tidewane-compass | items | The Tidewane Compass | artifact, magic |
| emberglass | items | Emberglass | material, magic |
| the-sundering | events | The Sundering | cataclysm |
| siege-duskwater | events | Siege of Duskwater | battle |
| era-founding | eras | The Founding Tides | dawn ("Before the First Sounding") |
| era-charts | eras | The Age of Charts | guild ("Year 512 of the Ember Cycle") |
| era-drowning | eras | The Drowning Years | cataclysm ("The Long Night — Third Era") |
| era-saltcinder | eras | The Salt & Cinder Days | present ("This turning of the tide") |

All 7 categories are represented. **Era assignments** (`_defEraByPage` ~line 1062): pages ↔ 1–3 eras each (e.g. duskwater ∈ charts+drowning+saltcinder; sera ∈ charts+saltcinder). **Graph**: 26 authored links + era links. **Backlinks**: 5 hand-written snippets into Sera. **Body copy**: one fully-written character article for Sera (3 paragraphs, callout, figure). **Covers**: 9 pages have gradient covers.

**Maps screen adds** 8 location pages not in the Dashboard set (highland-stair, drowned-quarter, guild-hall, harbor-gate, salt-market, keep-hall, keep-tower, keep-court), 4 maps with real PNGs in the project (`maps/*.png`), 12 pins with era memberships and per-map placements. **Inconsistency to reconcile in fixtures**: Maps' page list and era date labels ("Yr 512 · Ember Cycle") diverge slightly from the Dashboard's; the fixture dataset ticket should unify them.

## 5. Gaps and surprises (feed these into tickets)

1. **The editor is a facade.** The page body is hardcoded React (`renderBody()`); the slash menu inserts nothing (`insertBlock()` stub); toolbar buttons only toggle visual state. The real tiptap editor is entirely ours to build — the design specifies the *chrome* (slash menu items, toolbar set, composer hint, mention pills) but no editing behavior.
2. **No `[[wikilink]]` syntax anywhere.** Linking is @-mention chips (icon+title pills) inserted via menus; body links are the same chips. The MD serialization of these chips is an open domain decision (ticket #5).
3. **No MD/frontmatter anywhere in the design** — properties are JS objects. One code comment ("frontmatter `era` property", Dashboard ~line 1060) confirms the intended model. Concrete per-category frontmatter is only implied by `createSchemas` (§2.3) — a strong input for ticket #5.
4. **"Dashboard pins" don't exist in the current design.** `pinnedPages` (~line 1197) means "pages that have a map pin" and only powers the "See on map" chip. No favorites/quick-access feature is present (the `pinned-cover.png` screenshot appears to be an older iteration). The map's standing decision assumes two pin concepts — the dashboard-favorites side needs to be specced from scratch or dropped.
5. **Era-less pages don't exist on maps** — the design models "always visible" as *pin belongs to all eras* and forbids removing the last era (`toggleEra()` guard). The brief's "pages with no era stay pinned regardless of era" needs an explicit rule (ticket #6).
6. **Timeline is an ordered list, not a dated axis.** Eras have free-text date labels and a drag-reorderable order; nothing numeric. "Eras represent a span" = ordering + membership only.
7. **Reference canvas is a large feature not in the user's brief** (full whiteboard: 10 tools + shapes + laser + floating window). Scope decision needed — it's ~⅓ of the Dashboard file.
8. **Two graph implementations** — force-directed (active) and a fully-built "star map" constellation mode behind `GRAPH_STARMAP=false`, including a warp navigation transition. Ticket #8 should decide which ships (or both as a toggle).
9. **Dashboard ignores `?page=` deep links** that Maps emits — real routing must fix this.
10. **World-crumb label bug**: topbar says "Loreweave" while the world is "The Ninth Vale" (Dashboard line ~186).
11. **UserMenu is Portuguese** ("Perfil", "Configurações", "Sair") in an otherwise English UI; logout goes to Worlds, not Auth.
12. **Create flow really creates only Eras**; all other categories are stubbed. Also: no rename/delete/change-category anywhere.
13. **No settings, profile, notifications, sharing/collaboration UI** (members avatars on world cards are decorative).
14. **Dark-only, desktop-only** (see §3) — the fog items "theming/responsive" can close as "not in design; PRD should declare dark-only desktop v1".
15. `motionScale`/`bodyFont` are designer props but suggest user-facing settings (motion intensity, serif/sans reading mode).

## 6. Earlier iteration — Loreweave (superseded)

`uploads/Wiki de Worldbuilding com Backlinks/Loreweave.dc.html` (1368 lines) is the previous product iteration, branded **Loreweave**, bg `#08080a`: same sidebar + dashboard + page editor + create forms + reference canvas (fullscreen and floating) + force-directed graph, with **13 pages** (no era pages). It has **no timeline/eras, no maps, no dockable windows, no star map**. Useful only as provenance; the current five screens supersede it. The "Loreweave" world-crumb in the Dashboard is a leftover from this iteration.
