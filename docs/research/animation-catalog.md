---
title: LandForger animation & micro-interaction catalog
date: 2026-07-13
source: Claude Design project "LandForger" (c1e152f0-4870-4b24-b9c2-002a808e6563)
ticket: https://github.com/luckramos/landforger/issues/3
companion: design-inventory.md
---

# LandForger animation & micro-interaction catalog

Measurement pass over the five screen files (`LandForger-Auth.dc.html`, `LandForger-Worlds.dc.html`, `LandForger-Dashboard.dc.html`, `LandForger-Maps.dc.html`, `UserMenu.dc.html`). All line numbers refer to those files. Raw density: **45 `@keyframes`** (8 defined-but-unused), **~58 `animation:` sites**, **~150 `transition:` declarations**, **106 `style-hover` / 8 `style-focus` / 5 `style-active`** pseudo-state styles, and **~20 JS-orchestrated behaviors** (rAF loops, pointer loops, timeout chains, reflow-restarted animations).

Portability class used throughout: **(a)** pure CSS, portable 1:1 (ambient loops, hover/focus states, mount entrances of always-present elements) · **(b)** CSS animation/transition driven by a React state toggle (conditional mount, class/inline-style swap) · **(c)** needs JS orchestration (rAF, measurement, pointer loop, timeout chain).

---

## 1. Motion system overview

### 1.1 `--mo` motion-scale mechanism

- **Dashboard** (the reference implementation): designer prop `motionScale` (range 0.5–1.5, default 1; props line 919) is written once per render to the root element — `el.style.setProperty('--mo', String(this.props.motionScale ?? 1))` (`applyMotion()`, line 978–981). CSS consumes it via the exact pattern **`animation: <name> calc(var(--mo,1) * <N>ms) <easing> both`** in **24 places** (lines 229, 241, 299, 312, 316, 337, 386, 400, 424, 494, 513, 536, 555–556, 573, 587–588, 613, 622, 702, 793, 826, 872, and JS-built string line 1871). Multiplication semantics: **higher `motionScale` = longer duration = slower motion**.
- **Maps**: same prop (range 0–1.4, line 343) and the same `applyMotion()` (line 461), **but no CSS ever reads `var(--mo)` in Maps** — the property write is dead code. Instead every timing is computed in JS as **`Math.round(<N> * this.mo())`** and interpolated into inline `animation:`/`transition:` strings (lines 487–489, 504, 582, 693, 696, 813–814, 832, 878–880). Same multiply-is-slower semantics.
- **Dashboard JS inversions (inconsistency)**: two JS timings **divide** instead of multiplying — graph-reveal cadence `step = 170/this.props.motionScale` (line 1397) and star-warp navigation delay `Math.round(440/(this.props.motionScale||1))` (line 1389). With `motionScale`=1.5 the CSS gets slower while these two get *faster*. A port should normalize to one rule.
- **Not mo-scaled at all** (fixed durations even on Dashboard): canvas shape/color picker `lw-pop 150ms` (lines 670, 675), the dockable-window geometry transition (340ms, lines 1753, 1823), `lw-pulse 1s`, `lw-caret 1.1s`, `tl-glow 1000ms`, all star-map ambient loops, and every hover/focus transition.
- **Auth, Worlds, UserMenu have no motion scaling** — no `--mo`, no `motionScale` prop.

### 1.2 Easing curves (complete set — 7 cubic-beziers + 5 keywords + 1 JS curve)

| Curve | Count | Role / where |
|---|---|---|
| `cubic-bezier(.22,.61,.36,1)` | 64 (Auth 1, Worlds 3, UserMenu 1, Dashboard 50, Maps 9) | **House ease-out.** Every entrance keyframe, popover, view swap, collapse/expand, dock geometry, staggered reveal. |
| `cubic-bezier(.76,0,.24,1)` | 2 | Auth login↔signup panel swap only (symmetric ease-in-out, lines 37, 79). |
| `cubic-bezier(.5,0,.2,1)` | 2 | The two navigation bursts: `lf-burst` (Auth 163) and `mp-burst` (Maps 832). |
| `cubic-bezier(.4,0,.2,1)` | 1 | Maps drill-down/up zoom, `playAnim()` (line 487). Material "standard" curve. |
| `cubic-bezier(.36,.07,.19,.97)` | 1 | Auth error shake (line 213). |
| `cubic-bezier(.34,1.56,.64,1)` | 3 (Maps) | **Overshoot/back-out**: pin hover marker (line 37 CSS), era-rail dot (764), era-linked toggle knob (825). |
| `cubic-bezier(.34,1.42,.5,1)` | 2 (Dashboard) | Softer overshoot: graph node inner-circle scale pop (771), star core scale (1797). |
| `ease` | ~30 | Fades, scrims, image crossfade (`mp-eraFade … ease`, 488), Maps stage pan/zoom step (717). |
| `ease-in-out` | ~6 | Ambient loops: `lf-drift`, `lw-pulse`, `star-drift`, `star-pulse`, `star-hoverpulse`, `mp-bob`(unused). |
| `ease-out` | 3 | `mp-pulse` pin ring (696), `focal-ring` (1796). |
| `linear` | 2 | `lf-spin` spinner (166), `arrow-comet` edge flow (1819). |
| `step-end` | 1 | `lw-caret` composer caret blink (380). |
| JS `1-Math.pow(1-u,3)` (easeOutCubic) | 1 | `animateScroll()` eased timeline scroll (Dashboard 1228). |

### 1.3 `prefers-reduced-motion` strategy — NOT uniform across screens

| Screen | CSS media query collapses | JS `prefersReduced()` skips |
|---|---|---|
| Auth (line 31) | `*{animation-duration:0.01ms !important; transition:none !important}` (kills transitions entirely) | `replayForm()` stagger (198), `shake()` (209), submit nav delay 780→**120ms** (239) |
| Dashboard (line 45) | `*{animation-duration:0.01ms; animation-iteration-count:1; transition-duration:0.01ms; scroll-behavior:auto}` (all `!important`) | `animateScroll()` → instant jump (1228), `firePulse()` → no pulse (1231) |
| Maps (line 41) | `*{animation-duration:0.01ms !important; transition-duration:0.01ms !important}` | `playAnim()` (487), `fadeImg()` (488), nav delays 640×mo→**60ms** (504, 582), navBurst duration →1ms (832) |
| **Worlds** | **none** | **none** (no `matchMedia` in file) |
| **UserMenu** | **none** | **none** |

This contradicts the inventory's "`prefers-reduced-motion` handled globally on every screen" (design-inventory.md §3) — only 3 of 5 screens handle it.

### 1.4 Measured-geometry / FLIP-like techniques

No true FLIP anywhere. Four related techniques:

1. **State-pair geometry transition (dockable windows)** — full and float geometries are both expressed as concrete inline values (`left/top/width/height`: `0,0,100vw,100vh` vs `x,y,w,h px`) on one persistent element; a CSS transition `left 340ms, top 340ms, width 340ms, height 340ms cubic-bezier(.22,.61,.36,1), border-radius 300ms ease, box-shadow 300ms ease` animates the swap (Dashboard 1753, 1823, 1906). During pointer-drag the transition string is replaced with `'none'` so the window tracks the cursor 1:1, and restored on release — this is the interruption model.
2. **Animation-restart idiom** — `el.style.animation='none'; void el.offsetWidth; el.style.animation='<name> <dur> <ease> …'` forces a reflow so the same keyframe replays on demand. Used by Auth `replayForm`/`shake` (201–213) and Maps `playAnim`/`fadeImg` (487–488).
3. **Measured transform-origin** — Maps drill-down sets `transformOrigin` on the animation wrapper to the clicked pin's percentage position (`originForPlace()` 566, `enterMap()` 507–515) before playing `mp-zoomIn`, so the map zooms *out of the pin*.
4. **Rect measurement for positioning** (not animated, but feeds animated elements): UserMenu popover measures the avatar button rect (`measure()` 67–71: `top = rect.bottom+9`, `right = innerWidth-rect.right`); Dashboard hover-preview measures the hovered chip and flips above when `y+220 > innerHeight` (`showHover()` 1258–1265).

---

## 2. Per-screen catalog

Columns: trigger · target · properties animated · duration/delay · easing · mechanism · source · portability class.

### 2.1 Auth (`LandForger-Auth.dc.html`) — 16 entries

| id/name | Trigger | Target | Animates | Duration + delay/stagger | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| lf-drift | ambient (mount) | image-panel procedural texture div | `transform: translate(0,0)→(-22px,-14px)` (const `scale(1.06)`) | 18 000 ms, `infinite alternate` | ease-in-out | CSS @keyframes | line 43 | a |
| panel-swap | mode toggle (login↔signup) | both 50%-wide panels | `transform: translateX(0%↔100%)` (image and form swap sides) | 820 ms | `cubic-bezier(.76,0,.24,1)` | CSS transition on `transform`, values from state (`imgTransform`/`formTransform`) | lines 37, 79; renderVals 249–250 | b |
| lf-fieldIn stagger | mount **and** mode toggle | every `[data-stagger]` element (≈10 per mode: eyebrow, h1, subtext, fields, button, hint, footer) | `opacity 0→1`, `translateY(15px)→0` | 560 ms + **i×62 ms** per index, fill `both` | `cubic-bezier(.22,.61,.36,1)` | JS: `replayForm()` querySelectorAll + animation-restart idiom + inline `animation` write | lines 197–206, keyframe 23 | c |
| lf-shake | validation failure | whole `<form>` | `translateX` keyframed −9/+8/−6/+5/−3/0 px at 10/25/40/55/70/100% | 480 ms | `cubic-bezier(.36,.07,.19,.97)` | JS: `shake()` animation-restart idiom | lines 208–214, keyframe 25 | c |
| submit scrim | submit | fullscreen overlay | `opacity 0→1` (lf-fade) | 200 ms | ease | CSS @keyframes on conditional mount | line 162 | b |
| lf-burst | submit | 20 px bronze dot | `transform: scale(0)→scale(46)`, `opacity .9→1`, `forwards` | 720 ms | `cubic-bezier(.5,0,.2,1)` | CSS @keyframes on conditional mount | line 163, keyframe 27 | b |
| burst content fade | submit | spinner + "Entering your worlds…" column | `opacity 0→1` (lf-fade) | 320 ms, **delay 220 ms**, both | ease | CSS @keyframes | line 164 | b |
| lf-spin | while submitting | 44 px spinner ring | `rotate(0→360deg)` | 720 ms, infinite | linear | CSS @keyframes | line 166, keyframe 29 | a |
| submit-nav | submit | — | navigation to Worlds | setTimeout **780 ms** (120 ms reduced) | — | JS timeout chain | lines 239–240 | c |
| input focus | focus | name/email/password inputs | `border-color`, `background`, `box-shadow` (bronze ring `0 0 0 3px rgba(176,130,74,.14)`) | 160 ms | default (ease) | CSS transition + `style-focus` | lines 93, 100, 112 | a |
| "Forgot?" hover | hover | link span | `color` → #fff | 140 ms | default | CSS transition + `style-hover` | line 108 | a |
| pw-eye hover | hover | show/hide password button | `color`, `background` | 140 ms | default | CSS transition + `style-hover` | line 113 | a |
| submit hover/press | hover / active | submit button | hover: `filter: brightness(1.08)` + bigger glow (160 ms); active: `transform: scale(.985)` (120 ms) | 160 / 120 ms | default | CSS transition + `style-hover`/`style-active` | line 141 | a |
| remember checkbox | click | 20 px custom checkbox | `background` (transparent↔#B0824A), `border-color` | 160 ms | default | CSS transition, style object from state | renderVals 252–258 | b |
| footer CTA hover | hover | "Create an account" span | `color` → #fff | 140 ms | default | CSS transition + `style-hover` | line 154 | a |
| a:hover | hover | anchor elements | `color` (instant, no transition) | 0 | — | CSS `:hover` rule | lines 19–20 | a |

Defined but **unused** keyframes: `lf-ring` (scale .6→2.6 + fade, line 28), `lf-glowPulse` (opacity .55↔.85, line 30).

### 2.2 Worlds (`LandForger-Worlds.dc.html`) — 11 entries

| id/name | Trigger | Target | Animates | Duration + delay/stagger | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| wf-fade greeting | mount | greeting block (dateline/h1/p) | `opacity 0→1` | 500 ms, both | ease | CSS @keyframes | line 84 | a |
| wf-cardIn (create card) | mount | dashed "Forge a new world" card | `opacity 0→1`, `translateY(12px)→0`, `scale(.985)→1` | 460 ms, both, no delay | `cubic-bezier(.22,.61,.36,1)` | CSS @keyframes | line 100, keyframe 25 | a |
| wf-cardIn (world cards) | mount | each world card | same | 460 ms + **i×70 ms** `animation-delay` (computed in render, `w.delay`) | house curve | CSS @keyframes + render-computed delay | line 110; renderVals 316 | a |
| modal scrim | open create modal | fixed scrim (blur backdrop) | `opacity 0→1` (wf-fade) | 200 ms, both | ease | CSS @keyframes on conditional mount | line 144 | b |
| wf-modalIn | open create modal | 840 px modal panel | `opacity 0→1`, `translateY(14px)→0`, `scale(.97)→1` | 320 ms, both | house curve | CSS @keyframes on conditional mount | line 145, keyframe 27 | b |
| create-card hover | hover | create card | `border-color`, `background`, `box-shadow` (bronze glow) | 180 ms | default | CSS transition + `style-hover` | line 100 | a |
| world-card hover | hover | world card | `border-color`, `box-shadow` (bronze ring + glow; no transform) | 200 ms | default | CSS transition + `style-hover` | line 110 | a |
| genre chip select | click (state) | genre chips + "✎ Custom" | `border`, `background`, `color` via `transition: all 140ms` | 140 ms | default | CSS transition; style objects swapped by state | renderVals 328–338 | b |
| template box select | click (state) | 2 template tiles | `border`, `background` (`all 140ms`) | 140 ms | default | CSS transition + state | renderVals 348–350 | b |
| submit enable/disable | name input (state) | "Create world" button | `background`, `color`, `cursor` (`all 150ms`) | 150 ms | default | CSS transition + state | renderVals 354–359 | b |
| instant micro-states | hover/focus | Cancel button bg, input `style-focus`, color swatch ring, scrollbar thumb | color/background/border (no transition property → instant) | 0 | — | `style-hover`/`style-focus` only | lines 153, 156, 167, 209, 341–344; 22–24 | a |

Defined but **unused**: `wf-drift` (line 28). **No reduced-motion handling, no motionScale.**

### 2.3 UserMenu (`UserMenu.dc.html`) — 4 entries

| id/name | Trigger | Target | Animates | Duration | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| um-pop | avatar click (open) | 236 px popover | `opacity 0→1`, `translateY(-6px)→0`, `scale(.97)→1` | 160 ms, both | `cubic-bezier(.22,.61,.36,1)` | CSS @keyframes on conditional mount; position measured from button rect before open (`measure()`: `top=rect.bottom+9px`, `right=innerWidth−rect.right`) | lines 12, 20, 67–76 | b (+measurement) |
| avatar hover | hover | avatar button | `border-color`, `box-shadow` (bronze ring) | 150 ms | default | CSS transition + `style-hover` | line 16 | a |
| avatar open-ring | open state | avatar button | same properties, driven by state (`ringColor`/`ringShadow`) through the same 150 ms transition | 150 ms | default | CSS transition + state | renderVals 96–97 | b |
| menu item hover | hover | Perfil/Configurações rows; Sair row (red `oklch(0.5 0.12 25 / .16)` bg) | `background` | 130 ms | default | CSS transition + `style-hover` | lines 33, 41 | a |

**No reduced-motion handling.** Closing is instant (conditional unmount — no exit animation anywhere in the project).

### 2.4 Dashboard (`LandForger-Dashboard.dc.html`) — 40 entries

Chrome & views:

| id/name | Trigger | Target | Animates | Duration + delay/stagger | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| lw-viewIn | view swap (dashboard/page/create; also filter changes) | main content container, **`key={{view}}`** forces remount | `opacity 0→1`, `translateY(10px)→0`, `scale(.994)→1` | mo×300 ms, both | house curve | CSS @keyframes; React key-remount is the replay mechanism | line 229, keyframe 24 | b |
| sidebar collapse | collapse toggle / focus mode | `<aside>` | `width` 264↔68 px (→0 in focus), `opacity` | width 300 ms, opacity 240 ms | house curve (both) | CSS transition + state | line 51; renderVals 1915–1919 | b |
| sidebar rail↔full crossfade | collapse toggle | two absolutely-stacked layers (68 px rail, 264 px full) | `opacity` 0↔1 + `pointer-events` swap | 260 ms | house curve | CSS transition + state | lines 55, 104 | b |
| topbar focus collapse | focus mode | `<header>` | `height` 52→0 px, `opacity` 1→0 | height 300 ms, opacity 240 ms | house curve / default | CSS transition + state | line 180; renderVals 1926 | b |
| focus-exit pill | enter focus | fixed "Exit focus"+save indicator cluster | lw-cardIn (`opacity`, `translateY(6px)`, `scale(.98)`) | mo×220 ms, both | house curve | CSS @keyframes on conditional mount | line 613 | b |
| lw-stagger (home cards) | home mount | 7 category cards | `opacity 0→1`, `translateY(8px)→0` | mo×360 ms + **i×45 ms** delay, both | house curve | CSS @keyframes + render-computed `animation-delay` | line 241; renderVals 1548 | a |
| category card hover | hover | home category cards | `transform: translateY(-3px)`, `border-color`, `background` (bronze tint, `!important`) | 200 ms | house curve (transform) | CSS transition + `style-hover` | line 241 | a |
| recent row hover | hover | "Recently edited" rows | `background` (150 ms), **`padding-left` 16→20 px** (200 ms) | 150/200 ms | house curve (padding) | CSS transition + `style-hover` | line 252 | a |
| cat-list card hover | hover | 2-col page cards | `translateY(-2px)`, border, bg | 180 ms | house curve | CSS transition + `style-hover` | line 273 | a |
| saving pulse | any mock edit (`markSaving()`) | 6 px green dot + "Saving" | `opacity .35↔1`, `scale(.85↔1)` (lw-pulse), 1 s infinite; label swaps to "Saved" after **1400 ms** timeout | 1000 ms loop; 1400 ms state | ease-in-out | CSS @keyframes + JS timeout state | lines 203, 614; `markSaving()` 1251–1255 | b/c |
| crumb/topbar chip hovers | hover | "‹ Worlds", world crumb, search trigger, ✳/padlock/◎/▦ buttons | `background`, `color`, `border-color`, `box-shadow` | 150 ms | default | CSS transition + `style-hover` | lines 182–222 | a |
| sidebar item hovers | hover | nav rows, rail icons, tag chips (bronze `all 150ms`), "+ New page" | `background`, `color` (tags also border) | 140–160 ms | default / house (New page) | CSS transition + `style-hover` | lines 89–169 | a |

Page/editor surface:

| id/name | Trigger | Target | Animates | Duration + delay/stagger | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| cover fade | page mount (if cover) | 300 px cover div | `opacity 0→1` (lw-fade) | mo×380 ms, both | ease | CSS @keyframes | line 299 | b |
| tag chip in | tag added / page mount | tag pills (page + create form) | `opacity 0→1`, `scale(.9)→1` (lw-scaleIn) | mo×180 ms, both | house curve | CSS @keyframes on list render | lines 312, 513 | b |
| tag × hover | hover | remove glyph in chip | `opacity` .45→1 | 140 ms | default | CSS transition + `style-hover` | line 312 | a |
| read-only dimming | read-only toggle | "+ tag", "+ era", "+ add relation", composer | `opacity` 1→.32 + `pointer-events:none` | 200 ms | default | CSS transition + state (`affOpacity`/`affPE`) | lines 314, 332, 370, 377 | b |
| tag/era popovers | "+ tag" / "+ era" click | 236/252 px popover panels | lw-pop (`opacity`, `translateY(4px)`, `scale(.96)`) | mo×180 ms, both | house curve | CSS @keyframes on conditional mount | lines 316, 337 | b |
| slash menu | composer click | 302 px "Blocks" panel, `transform-origin: top left` | lw-pop | mo×200 ms, both | house curve | CSS @keyframes on conditional mount (`openSlash` 1499) | line 386 | b |
| mention menu | @ / toolbar @ / relation field | 302/300 px search popover | lw-pop | mo×200 ms, both | house curve | CSS @keyframes on conditional mount (`openMention` 1487, `openRelMention` 1494) | lines 400, 494 | b |
| menu row hovers | hover | slash/mention/tag/era option rows | `background` | 120–130 ms | default | CSS transition + `style-hover` | lines 320, 341, 390, 404, 498 | a |
| lw-caret | ambient (composer visible) | 2×21 px caret bar | `opacity` 1→0 hard blink (0–45% on, 55–100% off) | 1100 ms, infinite | **step-end** | CSS @keyframes | line 380, keyframe 30 | a |
| backlinks caret | section toggle | ▶ glyph | `transform: rotate(0↔90deg)` | 220 ms | house curve | CSS transition + state (`backlinkCaret`) | line 417; renderVals 1659 | b |
| lw-stagger (backlinks) | backlinks open | per-category groups | `opacity`, `translateY(8px)` | mo×280 ms, both (no per-index delay) | house curve | CSS @keyframes on conditional mount | line 424 | b |
| backlink row hover | hover | backlink cards | **`translateX(4px)`**, border, bg | 160 ms | house curve | CSS transition + `style-hover` | line 432 | a |
| mention chip (mentionEl) | hover→preview; click→navigate | inline icon+title pill | pill itself: `transition: background 160ms, box-shadow 160ms` declared but no hover style (dead); real affordance is the preview card | 160 ms (dead) | default | inline style; `showHover`/`hoverLeave`/`openPage` | `mentionEl()` 1524–1534 | a |
| hover preview card | mouseenter on any page reference | fixed 280 px card | lw-cardIn (`opacity`, `translateY(6px)`, `scale(.98)`) | mo×180 ms, both | house curve | CSS @keyframes on conditional mount; position measured, viewport-flip (`showHover` 1258–65) | line 536 | c |
| create select modal | "+ New page" | scrim + 520 px panel | scrim lw-fade mo×160 ms; panel lw-pop mo×220 ms | mo×160/220 ms, both | ease / house | CSS @keyframes on conditional mount | lines 555–556 | b |
| create tile hover | hover | 7 category tiles | `translateY(-3px)`, border, bg | 160 ms | house curve | CSS transition + `style-hover` | line 561 | a |
| create buttons | hover/active | "Create page" (`opacity .86` hover, `scale(.97)` active), Cancel | opacity/transform/bg/color | 140 ms | default | CSS transition + pseudo-states | lines 523–524 | a |
| format toolbar dock | ↑Top/↓Bottom segment | fixed toolbar pill | **`top`** 66 px↔`calc(100vh−58px)` (16 px in focus) mo×340 ms; **`left`/`width`** track sidebar width 300 ms | mo×340 / 300 ms | house curve | CSS transition + state (`barTop`, `barSbW`) | line 573; renderVals 1643–1648 | b |
| toolbar button states | hover / active toggle | 29 px buttons, segmented control | `background`, `color` | 130 / 160 ms | default | CSS transition + `style-hover` + state bg/col | lines 576, 579–580 | a/b |
| spotlight open | ⌘K / search trigger | scrim + 560 px panel | scrim lw-fade mo×160 ms; panel lw-pop mo×200 ms; input auto-focused post-mount | mo×160/200 ms, both | ease / house | CSS @keyframes on conditional mount + `componentDidUpdate` focus (977) | lines 587–588 | b |
| spotlight selection | ↑↓ / mouseenter | result rows | `background` transparent↔`rgba(255,255,255,.08)` | 110 ms | default | CSS transition + state (`selBg`) | line 596; searchList 1341 | b |

Overlays — canvas, graph, timeline:

| id/name | Trigger | Target | Animates | Duration + delay/stagger | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| window fade-in | open canvas/graph/timeline | the fixed window element | `opacity 0→1` (lw-fade) | mo×160 ms, both | ease | CSS @keyframes on conditional mount | lines 622, 702, 793 | b |
| dock float↔full | "Dock to window"/maximize/minimize | same window element | `left`, `top`, `width`, `height` (340 ms) + `border-radius`, `box-shadow` (300 ms); full=`0,0,100vw,100vh`, float default 820×620 @ (vw−w−40, 86) (canvas 560×400 @ (vw−w−40, 88/90)); minimized height 52 px (canvas 40 px) with body unmounted | 340/300 ms, **not** mo-scaled; `transition:'none'` during drag | house curve / ease | CSS transition + state geometry; drag via pointer loop (`dockWinDrag` 1205, `startWinDrag` 1305) | 1753, 1823, 1906 | c |
| canvas card drag + snap | pointerdown/move/up | notes/images/links/text cards | live: direct `transform` writes (transition `'none'`); release: snap to 8 px grid animated by `transform 260ms` + `box-shadow 200ms` | 260/200 ms | house curve | JS pointer loop + CSS transition re-enable | `startDrag` 1280–1303; trans 1704 | c |
| canvas selection ring | click/marquee | selected items | `box-shadow` 0↔bronze double ring | via 200 ms box-shadow transition | default | state swap | 1705 | b |
| canvas pan/zoom | drag / wheel | inner transform layer + dotted grid | `transform: translate(pan) scale(zoom)`; wheel is **cursor-anchored** (world-point preserved), clamp 0.35–2.5, factor 1.1/0.9 (buttons ×1.15); grid `background-size: 22×zoom`, `background-position: pan` — all instant writes | per-event | — | JS pointer loop + wheel handler (`onCanvasWheel` 1383) | 641–642, 1743–1744 | c |
| laser trail | laser tool drag | SVG path + dots overlay | trail points expire after **700 ms**; per frame: path via quadratic smoothing, dots `r = 3+op×2`, `opacity = op×.9`, `op = 1−age/700`; red glow via `drop-shadow` filters | rAF loop until empty | linear decay | JS rAF (`laserAdd`/`startLaser`/`clearLaser` 1380–1382) | line 651 | c |
| picker pop-ups | shape/color picker toggle | anchored panels above toolbar | lw-pop **150 ms** (not mo-scaled) | 150 ms, both | house curve | CSS @keyframes on conditional mount | lines 670, 675 | b |
| color swatch hover | hover | 22 px swatches | `transform: scale(1.14)` | 120 ms (+ box-shadow 140 ms) | default | CSS transition + `style-hover` | line 679 | a |
| graph reveal cadence | graph open | all nodes | node became "active" at `t0 + i×(170/motionScale) ms` in `createdOrder`; opacity 0→1 via `transition: opacity 300ms` house; inner circle `scale(.1)→1` via `transform 400ms cubic-bezier(.34,1.42,.5,1)` | 170/mo per node; +400 ms settle window | house / overshoot | JS rAF sim clock decides reveal; CSS transitions animate it | `startSim` 1390–1406; 767, 771 | c |
| graph force physics | graph open, node drag | node positions (inline `transform`), edge line endpoints | repulsion `1350/d²`; springs to length 195 (global)/170 (local), k=0.015; centering 0.008/0.006; focal pull 0.05; damping ×0.82; step ×0.32; stops when KE<0.4 & reveal done & no drag; **`forceUpdate()` every frame** | rAF loop | — | JS rAF simulation (`tickSim` 1408–1439) | 1408–1442 | c |
| graph node drag | pointerdown on node | dragged node | position written directly into sim (vx=vy=0), physics re-kicked (`kickSim`), resumes on release | pointer loop | — | JS (`graphNodeDown` 1442) | 1442 | c |
| graph hover dim | mouseenter node | non-neighbor nodes/edges | nodes `opacity→0.2` (300 ms transition); edges `opacity .42→.09` (no transition, per-render); hovered ring `box-shadow` | 300 ms / instant | house | state (`graphHover`) + CSS transition | 1766–1768 | b |
| graph pan/zoom | drag bg / wheel | inner layer | translate+scale, clamp 0.4–2.6, wheel ×1.1/0.9 (not cursor-anchored), buttons ×1.18 | per-event | — | JS pointer loop (`graphBgDown` 1450, `onGraphWheel` 1451) | 1450–1451 | c |
| tl-nodeIn | timeline open | era nodes (vertical rail) | `opacity 0→1`, `translateY(14px)→0` | mo×360 ms + **min(i,8)×55 ms** delay, both | house curve | CSS @keyframes, JS-built animation string | 837; 1871 | b |
| era card hover | hover | era node card | purple tint bg/border, `box-shadow`, `translateY(-2px)` | 200 ms | default | CSS transition + `style-hover` | line 842 | a |
| era expand/collapse | caret click | node body | `max-height 0↔1600px` (300 ms) + `opacity` (260 ms); caret `rotate(0↔90deg)` 240 ms | 300/260/240 ms | house curve | CSS transition + state (`expandedEras`) | lines 859, 862; renderVals 1868 | b |
| era member chips | node expand | member page chips grouped by category | lw-scaleIn mo×220 ms + **mi×40 ms** per-chip delay; hover `translateY(-2px)` 160 ms | mo×220 ms + 40 ms/chip | house curve | CSS @keyframes + computed delay | line 872; 1856 | b |
| tl-glow focus pulse | "See on timeline" / occurrence nav | 22 px halo behind era dot | `box-shadow` 0 → `0 0 0 3px rgba(200,160,230,.55), 0 0 30px 6px …` at 22% → 0 | 1000 ms, both; state cleared by 1000 ms timeout | house curve | CSS @keyframes gated by `pulseEra` state (`firePulse` 1231); dot ring `box-shadow` transition 220 ms (841) | keyframe 34; 840 | c |
| eased timeline scroll | focus flow / open | `[data-tlscroll]` container `scrollTop` | scroll to `node.offsetTop−24`; `dur = min(560, 220+0.45×|Δ|) ms`; easeOutCubic; cancels prior rAF; 90 ms `afterTimeline` mount delay first | 220–560 ms | JS `1−(1−u)³` | JS rAF (`animateScroll` 1228, `scrollTimelineTo` 1229) | 1227–1230 | c |
| era drag-reorder (manage) | drag ⠿ handle | dragged row + siblings | dragged: `translateY(dy) scale(1.01)`, transition `'none'`, z-60, shadow, darker bg; siblings shift ±**64 px** (`MG_STRIDE`) with `transform 220ms` house; drop line at `over×64−5 px` (purple, glow); on release: array splice + localStorage persist + markSaving | live + 220 ms | house curve | JS pointer loop (`startEraDrag` 1244) + CSS transition on siblings | 1244, 1875–1881, 904 | c |
| era drag (timeline mode) | **not wired** | — | full render path exists (`dragTL`, `TL_STRIDE=98`, drop line `40+over×98−8 px`, expansion collapse during drag) but no pointerdown handler calls `startEraDrag(…, 'timeline')` | — | — | vestigial | 1849–1874 | — |
| occurrence nav ↑↓ | ◀▶ buttons | timeline | re-runs scroll + pulse to next/prev era of focused page ((i±1) mod n) | as scroll/pulse | — | JS (`gotoOcc` 1239) | 1239 | c |

Star map (built, behind `GRAPH_STARMAP=false`, line 1387 — catalog anyway):

| id/name | Trigger | Target | Animates | Duration + delay/stagger | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| star-in | graph open | each star node inner wrapper | `opacity 0→1`, `scale(.2)→1` | 640 ms + **min(i,24)×45 ms**, both | house curve | CSS @keyframes, JS-built string; layout = phyllotaxis ×1.75 spread | 1794; keyframe 35 | b |
| star-drift | ambient | star drift wrapper | `translate` ±5 px wander (4 waypoints) | `17+(i%7)×2.6` s, **negative delay −(i×3.1 % 22) s**, infinite | ease-in-out | CSS @keyframes, per-node randomized | 1793; keyframe 39 | a |
| star-pulse / halo | ambient | radial-gradient halo (r×4.6–6) | `opacity .2↔.48`, `scale .9↔1.14` | 3.6 s (beacons) / 5 s, delay `(i%5)×0.3 s`, infinite | ease-in-out | CSS @keyframes | 1795; keyframe 36 | a |
| star-hoverpulse | hover | halo + core | halo swaps to 1.5 s pulse; core `scale(1)→1.2` via `transform 400ms cubic-bezier(.34,1.42,.5,1)`, glow `box-shadow 300ms ease` | 1.5 s loop / 400 ms | ease-in-out / overshoot | state-swapped `animation` string + CSS transition | 1786, 1795, 1797 | b |
| focal-ring | ambient (beacons: top-2 degree gold nodes, or focal) | ring border | `opacity .5→0`, `scale(.8)→2` | 3 s, infinite | ease-out | CSS @keyframes | 1796; keyframe 41 | a |
| arrow-comet | ambient / hover speeds up | bowed quadratic edge paths (`pathLength=1`, `stroke-dasharray:0.12 0.88`) | `stroke-dashoffset 1→0` (comet dash travels the edge) | hover-active 1.4 s, normal 2.6 s, dimmed 5.5 s; delay −(i%5)×0.55 s, infinite | linear | CSS @keyframes on SVG stroke | 1812–1819; keyframe 40 | b |
| star hover dim | hover | non-neighbor stars/edges | star `opacity→0.13` via `transition: opacity 340ms ease`; edge opacities re-computed | 340 ms | ease | state + CSS transition | 741, 1780, 1816 | b |
| warp-out | star click | clicked core: `scale(2.4)` via 400 ms transition; all others `opacity→0.05`; arrows→0; white radial overlay `star-warp` 0→1@28%→0, 460 ms forwards; navigate after `440/motionScale` ms | see left | 460 ms / 400 ms / 440 ms nav | ease / overshoot | JS `openStar` (1389) sets `starWarp` state + setTimeout nav; CSS does the visuals | 754–756, 1389, 1785 | c |

Defined but **unused**: `lw-shimmer` (28), `star-twinkle` (44), `arrow-draw` (42).

### 2.5 Maps (`LandForger-Maps.dc.html`) — 22 entries

| id/name | Trigger | Target | Animates | Duration + delay/stagger | Easing | Mechanism | Source | Port |
|---|---|---|---|---|---|---|---|---|
| stage pan/zoom | drag / wheel / buttons | stage (1600:1080 aspect) | `transform: translate(pan) scale(zoom)`; zoom clamp **0.6–3.4**, wheel ×1.1/0.9 (not cursor-anchored), buttons ×1.25; `transition: transform 140ms ease` when idle (zoom steps animate), `'none'` while panning | 140 ms / live | ease | JS pointer loop + wheel + CSS transition toggle | 523–527, 530–556, 714–717 | c |
| mp-zoomIn (drill down) | enter child map | animation wrapper around stage | `opacity 0→1`, `scale(1.55)→1`, **`transformOrigin` = pin's `x% y%`** | **600×mo ms** | `cubic-bezier(.4,0,.2,1)` | JS `playAnim()` animation-restart idiom, skipped if reduced | 487, 507–515, 566–567; keyframe 24 | c |
| mp-zoomOut (breadcrumb up) | crumb click | same wrapper | `opacity 0→1`, `scale(.72)→1`, origin center | 600×mo ms | same | same (`goCrumb` 516–520) | keyframe 25 | c |
| pin appear | era change / map change filters pins | pin wrapper | `opacity 0→1` (mp-fade) | **320×mo ms**, both | ease | CSS @keyframes, JS-built string, on list re-render | 693 | b |
| pin counter-scale | every zoom change | pin scaler div | `transform: scale(1/zoom)`, origin bottom-center → pins constant screen size | instant per render | — | JS inline style write (`zi=1/s.scale`) | 678, 694 | c |
| pin hover | hover | `.mappin-marker` / `.mappin-label` | marker `translateY(-4px) scale(1.14)` + shadow/border 170 ms; label `opacity 0→1`, `translateY(5px)→0` 150 ms; wrapper z-index bump | 170 / 150 ms | **`cubic-bezier(.34,1.56,.64,1)`** (overshoot) | the only CSS-class hover rules in the project (`<helmet>` block) | 34–40 | a |
| mp-pulse (selected pin) | pin selected | 38 px ring border | `scale(1)→2.4`, `opacity .8→0` (holds at 70%) | **1400×mo ms**, infinite | ease-out | CSS @keyframes, JS-built string | 696; keyframe 31 | b |
| era image crossfade | era click / image upload | previous image stashed below; current image div | current: `opacity 0→1`, `scale(1.035)→1` (mp-eraFade) **520×mo ms**; prev removed after **560×mo+40 ms** timeout | 520×mo ms | ease | JS: `stashPrev()` timeout + `fadeImg()` restart idiom | 488–501, 646–656 | c |
| era rail dot | era click | 4 era dots on rail | `width/height` 11↔15 px, `background`, `border`, glow ring — `all 220ms` | 220 ms | `cubic-bezier(.34,1.56,.64,1)` | CSS transition + state | 761–764 | b |
| era rail line fill | era click | left/right half-line segments per node | `background` gray↔era color (+glow shadow), fill up to active index | 300 ms | default | CSS transition + state | 765–768 | b |
| era label / open-page | era click | label color 200 ms; "open page ↗" `opacity` 0↔1 180 ms (+pointer-events) | 200/180 ms | default | CSS transition + state | 769–770 | b |
| era header tint | era click | header dot/name/counter | `background`/`color` to era color | 300 ms | default | CSS transition + state | 315–318 | b |
| timeline dock collapse | chevron click | bottom bar | `height` 46↔132 px **420×mo ms**; chevron `rotate(180deg)` 420×mo; track `opacity` 320×mo ms (**120 ms delay when opening**) + `translateY(10px)→0` 420×mo | 420/320×mo ms | house curve / ease | CSS transition + state | 878–880, 309–320 | b |
| navBurst | "Open full page" / "Open era page" | 20 px dot + title text overlay | dot `scale(0)→60` (mp-burst) **620×mo ms** forwards (1 ms reduced), colored by category/era; text mp-fade 300 ms delay 200 ms; `location.href` after **640×mo ms** (60 reduced) | 620×mo + 640×mo nav | `cubic-bezier(.5,0,.2,1)` | JS state + setTimeout nav; CSS visuals | 832, 300–303, 504, 579–583 | c |
| inspector slide | pin select | right drawer 328 px | `opacity 0→1`, `translateX(26px)→0` (mp-slideR) | 300 ms, both (**not** mo-scaled) | house curve | CSS @keyframes on conditional mount | 149; keyframe 28 | b |
| docked reader | "docked" action | bottom sheet (max 48% height) | `opacity 0→1`, `translateY(26px)→0` (mp-slideUp) | 300 ms, both | house curve | CSS @keyframes on conditional mount | 199; keyframe 29 | b |
| settings/add-pin modals | header buttons | scrim + panel | scrim mp-fade 160 ms; panel mp-pop (`translateY(10px)`, `scale(.97)`) 240 ms both | 160/240 ms | ease / house | CSS @keyframes on conditional mount | 222–223, 257–258 | b |
| placing banner | pick page to place | top banner | mp-pop 240 ms ease | 240 ms | ease | CSS @keyframes on conditional mount | 141 | b |
| picker group accordion | group header click | category body | `max-height` 0↔`7+n×45 px` **340×mo ms** + `opacity` 260×mo ms; chevron `rotate(−90↔0)` 320×mo ms | 340/260/320×mo ms | house curve | CSS transition + state (measured row count, not DOM) | 810–814 | b |
| era-linked toggle | settings switch | 40×23 px track + 17 px knob | track `background` 180 ms; knob `left` 3↔20 px 180 ms | 180 ms | knob: `cubic-bezier(.34,1.56,.64,1)` | CSS transition + state | 823–825 | b |
| pin drag (edit) | pointerdown in edit mode | pin placement | `left/top` % written live, clamped x 2–98 / y 3–97; no easing | live | — | JS pointer loop (`startPinDrag` 538–556) | 546–556 | c |
| small hovers | hover | header buttons, inspector actions (`filter:brightness(1.08)` on Dive), row hovers 120 ms, edit button `all 140ms` state swap, crumb color 140 ms | bg/color/filter | 0–140 ms | default | `style-hover` (16 in file) / state | 48–79, 171–189, 270–279, 842 | a |

Defined but **unused**: `mp-bob` (32), `mp-tlOpen` (30 — the era dock actually uses height/opacity transitions instead).

---

## 3. JS orchestrations in depth

Reproduction notes for a React implementer. Common idiom first: **animation-restart** = set `el.style.animation='none'`, force reflow with `void el.offsetWidth`, then write the full `animation` shorthand — this replays a keyframe on the same element on demand (the prototype's substitute for React key-remounts).

### 3.1 Auth

- **Panel swap** (`toggleMode` 216–219, lines 37/79): pure state → both panels carry a persistent `transition: transform 820ms cubic-bezier(.76,0,.24,1)`; login sets image `translateX(0%)`/form `translateX(100%)`, signup inverts. Interruptible by construction (CSS transition retargets mid-flight). Copy re-renders instantly at toggle (no crossfade of text).
- **Field stagger replay** (`replayForm` 197–206): on mount and after every mode toggle (as `setState` callback), query `[data-stagger]` inside the form, and per element `i` write `animation: lf-fieldIn 560ms cubic-bezier(.22,.61,.36,1) ${i*62}ms both` after a restart. Skips entirely under reduced motion. React port: key the form by mode and use render-computed `animationDelay`, or a variants/stagger primitive.
- **Shake** (`shake` 208–214): restart idiom on the `<form>`: `lf-shake 480ms cubic-bezier(.36,.07,.19,.97)`. Fired by any of the three validation failures in `submit` (234–236). Re-fires correctly on repeated failures thanks to the reflow.
- **Submit burst** (`submit` 228–241): guard `submitting`; set `submitting:true` → conditional overlay mounts (scrim 200 ms fade, dot `lf-burst` 720 ms forwards, content fade 320 ms @220 ms, spinner loop); `setTimeout(→ href, 780)` (120 reduced). Note the nav delay (780) overlaps the 720 ms burst; nothing awaits animation end.

### 3.2 Worlds

- **Card entrance**: no JS beyond render — `renderVals` computes `delay:(i*70)+'ms'` per filtered card (316) applied as `animation-delay` on `wf-cardIn 460ms both`. Because delay is index-based on the *filtered* list, retyping the search restaggers whatever re-renders. No replay mechanism: cards animate only when newly mounted.

### 3.3 UserMenu

- **um-pop** (`toggle`/`measure` 67–76): before opening, measure the avatar's `getBoundingClientRect()`; place a fixed popover at `top: rect.bottom+9px`, `right: innerWidth−rect.right px`; conditional mount plays `um-pop 160ms` house curve. Close = unmount (no exit). A resize while open is not re-measured.

### 3.4 Dashboard

- **View swaps**: single container with `key={{view}}` (line 229) — every `view` change remounts it, replaying `lw-viewIn mo×300ms`. Filter changes within `view==='dashboard'` do *not* remount (key is just `view`), so cat/tag list swaps reuse the entering DOM; the home cards' `lw-stagger` replays only via mount.
- **Sidebar collapse crossfade** (51/55/104): one `<aside>` animates `width` 300 ms; *inside*, the 68 px rail and the 264 px full layout are both always rendered, absolutely stacked, and crossfaded (`opacity` 260 ms + `pointer-events`) — a state toggle, no measurement. Focus mode drives width→0/opacity→0 on the same transitions plus header `height→0`.
- **Spotlight** (587–605, 1332–1344, 977): open sets state (also toggled by ⌘K in a document keydown listener); `componentDidUpdate` focuses the input on the open transition. Fuzzy matcher scores per char (+4 consecutive, +3 first char), highlight rebuilds the title as per-char `<span>`s. Selection moves via ↑↓/mouseenter changing `searchSel` → row `background` transitions 110 ms. Enter activates; Esc closes.
- **Slash / mention menus** (1487–1501, 386/400): plain conditional mounts with `lw-pop mo×200ms`, `transform-origin: top left`; mutually exclusive (opening one closes the others); outer click (`closeMenus` on the page container) closes; `insertBlock()` is a stub that closes + `markSaving()`.
- **Toolbar dock** (573, 1643–1648): the fixed toolbar's `top` is a state-computed value — top-anchor: `66px` (16 in focus); bottom-anchor: `calc(100vh − 58px)` — with `transition: top mo×340ms` house, so anchor flips glide. `left:calc((100vw + sbW)/2) translateX(-50%)` and `width:min(760px, 100vw−sbW−32px)` transition 300 ms whenever the sidebar width changes. Hidden in read-only (`showToolbar`).
- **markSaving** (1251–1255): every mock mutation calls it — sets `saving:true`, clears/re-arms a 1400 ms timeout back to `false`. "Saving" dot pulses via `lw-pulse 1s infinite`; "Saved" is the idle text.
- **Timeline**:
  - *Node stagger*: JS-built `animation` string `tl-nodeIn calc(var(--mo,1)*360ms) house ${min(i,8)*55}ms both` (1871) — delay capped at index 8.
  - *Focus pulse*: `firePulse(eraId)` (1231) sets `pulseEra` → a 22 px halo div mounts behind the era dot playing `tl-glow 1000ms both`; a 1000 ms timeout clears the state (unmounts). Guarded by `prefersReduced()`; re-entrant (clears prior timeout).
  - *Eased scroll*: `openTimelineForPage`/`openTimelineAtEra`/`gotoOcc` wait 90 ms for mount (`afterTimeline` 1227), then `scrollTimelineTo(era)` finds `[data-era=…]`, and `animateScroll` (1228) rAF-tweens `scrollTop` to `offsetTop−24` with `dur=min(560, 220+0.45|Δ|)` and easeOutCubic; cancels any in-flight tween (interruption-safe); reduced motion jumps.
  - *Drag reorder* (manage mode only — `startEraDrag` 1244 wired at 1878): pointer loop tracks `dy`; `over = clamp(index + round(dy/64))`; render gives the dragged row `translateY(dy) scale(1.01)` with `transition:'none'`, z-60 and a shadow, siblings a ±64 px `translateY` shift *with* `transform 220ms` (so they slide around the ghost), and a glowing drop line at `over×64−5 px`. On pointerup, splice `eraOrder`, persist to `localStorage('lf_eraOrder')`, `markSaving()`. The parallel timeline-mode path (stride 98, drop line `40+over×98−8`, bodies collapse during drag) is fully rendered but **no handler ever calls it** — vestigial.
- **Graph (force-directed, active)**:
  - *Reveal cadence*: `startSim` (1390) sorts nodes by `createdOrder`, seeds each at `layoutPos×0.35 ± 4px` random, assigns `revealAt[id]=t0+i×(170/motionScale)`; a node participates in physics and becomes visible only once `now ≥ revealAt` — visibility animates via CSS (`opacity 300ms` house; inner `scale .1→1` over `transform 400ms cubic-bezier(.34,1.42,.5,1)`).
  - *Physics* (`tickSim` 1408): per frame over active nodes — pairwise repulsion `f=1350/d²`; springs along edges toward rest length 195 (global) / 170 (local scope) with k=0.015; weak centering (0.008x/0.006y); local-scope focal node pulled to center at 0.05 unless being dragged; integrate `v*=0.82; p+=v*0.32` skipping the dragged node; **`this.forceUpdate()` every frame**; auto-stops when total KE<0.4 after reveal completes and nothing is dragged. Layout seeds: global = phyllotaxis spiral `r=92√(i+.55)`, golden angle, sorted by degree; local = focal at center + neighbors on a ring (R=170, 210 if >7).
  - *Drag*: `graphNodeDown` (1442) zeroes the node's velocity and writes its position from the pointer each move, calling `kickSim()` so physics stays alive around it; on release, `revealDone=0` and physics resumes for everyone. A `_graphMoved` flag suppresses the click-navigation if the pointer traveled >3 px.
  - *Hover dim*: `graphHover` state → non-neighbors get `opacity 0.2` (CSS 300 ms), edges not touching the hovered node drop to 0.09 opacity (recomputed attributes, no transition).
- **Star map warp-out** (disabled, `GRAPH_STARMAP=false` 1387; `openStar` 1389): click sets `starWarp:id` (+hover) — render then: clicked core jumps to `scale(2.4)` *through its 400 ms overshoot transition*, all other stars drop to `opacity 0.05` (340 ms ease), arrows fade (`baseOp 0.04`, `flowOp 0`), and a fullscreen white radial overlay plays `star-warp` (0→1 @28%→0) 460 ms forwards; `setTimeout(closeGraph + openPage, 440/motionScale)` navigates mid-flash. `_starNav` guard prevents double-fire.
- **Reference-canvas laser trail** (1380–1382, 651): pointer positions are appended as `{x,y,t:performance.now()}`; a rAF loop filters points older than **700 ms** each frame (setState) and stops itself when empty; render draws one quadratic-smoothed path (`pathD`, opacity 0.4, red drop-shadow) plus per-point dots with `op=1−age/700`, `r=3+2op`, `opacity=.9op`. Switching tools calls `clearLaser()`.
- **Canvas item drag + grid snap** (`startDrag` 1280–1303): pointer loop writes x/y (divided by zoom) with the card's transition set to `'none'` (1704); on pointerup, coordinates are rounded to an 8 px grid **and the transition is restored first**, so the snap itself animates over `transform 260ms` house — a cheap, satisfying settle.
- **Dock float↔full** (`dockWinDrag` 1205 generic for `tlWin`/`graphWin`; `startWinDrag` 1305 for canvas): geometry lives in state (`{x,y,w,h,min}`; null x/y = default `vw−w−40, 86` — canvas 88/90). Mode buttons only flip `tlDock`/`graphDock`/`canvas` between `'full'|'float'` — the persistent element's inline `left/top/width/height` change and the 340/300 ms transition (1753/1823/1906) morphs the window. While dragging/resizing, `_dockDrag`/`winDrag` state switches the transition to `'none'`; minimum sizes 440×320 (tl/graph) / 360×240 (canvas); minimize keeps only the 52 px (40 px canvas) header, body unmounted.

### 3.5 Maps

- **Pan/zoom** (530–556, 523–527, 714–717): pan = pointer loop writing `pan` px; zoom = wheel (×1.1/0.9) or buttons (×1.25), clamped 0.6–3.4, **around center** (not cursor-anchored, unlike the Dashboard canvas). The stage keeps `transition: transform 140ms ease` while idle so wheel-steps animate smoothly, switching to `'none'` during pan drags.
- **Drill-down zoomIn/zoomOut** (`enterMap` 507 / `goCrumb` 516 / `playAnim` 487): navigation resets pan/scale/selection, then as a `setState` callback plays the restart idiom on the wrapper *around* the stage: `mp-zoomIn|mp-zoomOut ${600×mo}ms cubic-bezier(.4,0,.2,1)` with `transformOrigin` set to the clicked pin's `x% y%` (`originForPlace`) for zoomIn, `center` for zoomOut. So "dive" scales down from 1.55 anchored at the pin; "back up" scales up from 0.72.
- **Pin counter-scaling** (678, 694): each pin has an inner scaler div with `transform: scale(1/zoom)`, `transformOrigin: bottom center` (the tail tip), recomputed per render — pins stay constant screen-size while the map zooms; wrapper stays at `left/top %` with `translate(-50%,-100%)`.
- **Era image crossfade** (`setEra` 492–502, `stashPrev` 489, `fadeImg` 488): if the map is era-linked and the URL changes, the old URL is stashed into `prevImg` (rendered as a static layer *below* the current image) and cleared by a `560×mo+40 ms` timeout; the current image div replays `mp-eraFade ${520×mo}ms ease` (opacity 0→1 + scale 1.035→1) via the restart idiom. Upload replacement (652) reuses the same pair. Deselects the pin if it doesn't exist in the new era.
- **navBurst** (`openEraPage` 504 / `navToPage` 579): sets `navBurst:{color,title}` → overlay mounts: 20 px dot `mp-burst` scale(0→60) `620×mo` ms `cubic-bezier(.5,0,.2,1)` forwards colored by era/category, plus title text fading in at 200 ms; `location.href` fires after `640×mo` ms (60 reduced; burst duration 1 ms reduced).
- **Inspector slide** (149): purely conditional mount with `mp-slideR 300ms` house; closing unmounts instantly. Era checklist rows animate `background 120ms` on toggle; `toggleEra` refuses to remove the last era.
- **Pin drag (edit mode)** (538–556): pointer loop converts client coords to stage-relative %, clamped x∈[2,98], y∈[3,97], written straight into `place` state (deep-cloned) — no easing; `moved` flag suppresses the click-select on release.

---

## 4. Portability assessment

Tallying the ~93 catalog rows (Auth 16, Worlds 11, UserMenu 4, Dashboard 40, Maps 22; the unwired timeline-mode drag excluded):

| Class | Count | Share | What's in it |
|---|---|---|---|
| **(a) pure CSS 1:1** | ~34 | ~37% | All hover/focus/active micro-states (106 `style-hover` sites collapse into these rows), ambient loops (drift, spin, caret, pulse, star ambient), mount entrances with render-computed delays (Worlds cards, home category stagger) |
| **(b) CSS + React state toggle** | ~38 | ~41% | Every popover/modal/drawer entrance, view swaps via key-remount, sidebar/header collapse, toolbar dock, expand/collapse (max-height), era rail states, selection states, saving indicator, star-map ambient-vs-hover swaps |
| **(c) JS orchestration** | ~21 | ~22% | Stagger replays + shake (restart idiom), submit/nav timeout chains, eased scroll (rAF), focus pulse (timeout state), graph reveal + force physics + node drag (rAF), laser trail (rAF), canvas & pin & window & era-row pointer-drag loops, drag→snap transition juggling, drill zoom with measured origin, era crossfade (timeout pair), hover-preview measurement |

Recommendation-shaped summary (NOT a decision):

- **A 1:1 CSS port is realistic for ~78% of the catalog** (a+b): the design system is disciplined — one house curve, entrances of 160–460 ms, `both` fill, small translate+scale+fade deltas. Port as: keyframes in a global sheet (or Tailwind/vanilla-extract equivalents), `animationDelay` computed in render for staggers, conditional mount for popovers (accepting the prototype's no-exit-animation behavior), and a `--mo` custom property on the app root multiplied via `calc()` — exactly the Dashboard pattern, extended to the three screens that lack it. The reduced-motion global (`0.01ms` + iteration-count 1 + scroll-behavior auto, Dashboard variant) should become universal.
- **A motion library genuinely helps in three places**: (1) **interruptible measured-geometry transitions** — the dockable windows and toolbar dock are hand-rolled state-pair transitions with manual `transition:'none'` toggling during drag; a FLIP/layout-animation primitive (e.g. Motion's `layout`) makes these robust to interruption and content reflow; (2) **staggered replays on re-render** — Auth's restart idiom and the timeline/graph reveal cadences map directly to variants/stagger orchestration instead of DOM-poking; (3) **physics & frame loops** — graph force simulation, eased scrollTop, laser decay are rAF domains regardless (d3-force or a spring library for the graph; the rest are ~15-line hooks). Exit animations exist nowhere in the prototype — deciding whether to add them (AnimatePresence-style) is a net-new design decision, not a port requirement.
- **Watch-outs for the port**: per-frame `forceUpdate()` in the graph sim and per-frame `setState` in the laser loop should become ref/imperative writes; the `--mo` divide-vs-multiply inconsistency (§1.1) needs one semantic; the 8 unused keyframes can be dropped; the vestigial timeline-mode drag needs a product call (wire it or delete it).

## 5. Load-bearing ranking — the 10 animations most central to the product feel

1. **Dashboard `lw-viewIn` keyed view swap** (229) — every navigation inside the wiki passes through this 300 ms rise-and-fade; it *is* the app's rhythm.
2. **Maps drill-down `mp-zoomIn` from the pin's transformOrigin** (487/507) — the signature spatial metaphor: worlds nest, and the camera dives into the exact pin you clicked.
3. **Dockable window float↔full 340 ms geometry morph** (1753/1823/1906) — timeline/graph/canvas feel like one continuous surface rather than modals; the most architecturally demanding piece.
4. **Graph reveal cadence + force physics** (1390–1442) — the 170 ms-per-node constellation build plus living springs makes the world's connectedness tangible.
5. **Auth panel swap 820 ms `cubic-bezier(.76,0,.24,1)`** (37/79) — the first-impression set-piece; login↔signup as one sliding stage.
6. **Timeline focus flow: eased scroll + `tl-glow` pulse** (1228/1231) — "see on timeline" lands you on the era and points at it; the moment eras stop being abstract.
7. **Maps era crossfade (`mp-eraFade` + stashed previous image)** (488–501) — the map literally redraws as history changes; core to the era concept.
8. **Staggered entrances family** (`lf-fieldIn` 62 ms, `wf-cardIn` 70 ms, `lw-stagger` 45 ms, `tl-nodeIn` 55 ms, star-in 45 ms) — one consistent idiom that makes every screen feel composed rather than dumped.
9. **Pin micro-set: hover overshoot + counter-scaling + selected `mp-pulse`** (34–40, 694, 696) — maps read as alive and precise at any zoom level.
10. **navBurst / lf-burst color-dot page transitions** (832/163) — cross-screen navigation gets a colored ripple instead of a hard cut; cheap, distinctive, and the only cross-page motion language.

## 6. Deltas vs. the design inventory (issue #2)

1. **`prefers-reduced-motion` is NOT handled on every screen** — Worlds and UserMenu have neither the media query nor `prefersReduced()` (inventory §3 claims global handling).
2. **`--mo`/`motionScale` only exists on Dashboard and Maps**, and Maps never consumes the CSS variable it sets (JS-multiplied strings instead). Auth/Worlds/UserMenu are unscaled.
3. **Two Dashboard JS timings divide by `motionScale`** (graph reveal 170/mo, star warp 440/mo) — inverted semantics vs. the `calc(var(--mo)*ms)` multiply everywhere else.
4. **Timeline drag-to-reorder is only wired in Manage mode** — the timeline-mode drag path (stride 98) is rendered but has no pointerdown caller (inventory §2.3 says "both modes"). The 98/64 px strides themselves are confirmed.
5. **8 of 45 keyframes are dead**: `lf-ring`, `lf-glowPulse`, `wf-drift`, `lw-shimmer`, `star-twinkle`, `arrow-draw`, `mp-bob`, `mp-tlOpen`.
6. Star-map markup carries the comment "STAR MAP (active)" (722) while the logic ships `GRAPH_STARMAP=false` (1387) — force-directed is what renders, as the inventory says, but the stale comment is a trap for readers.
7. No content fetched from the design project contained instruction-like text; nothing suspicious to report.
