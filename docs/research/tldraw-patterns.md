# tldraw architecture patterns to adapt

Research asset for [tldraw architecture patterns to adapt (read-only)](https://github.com/luckramos/landforger/issues/90),
a ticket of [Wayfinder map: Reference canvas → tldraw SDK refactor](https://github.com/luckramos/landforger/issues/81).

## Purpose & provenance

The Reference Canvas is being rebuilt as a **custom, dependency-free** engine after the tldraw SDK was
ruled out (its SDK needs a paid production license — see the closed spike). This document distills the
**architecture patterns** worth adapting from tldraw and, just as important, **what to deliberately
simplify** for LandForger's much smaller scope.

**Provenance / licensing.** tldraw's source is under the [tldraw license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)
(not MIT). We take **general architectural ideas** — how a canvas editor tends to be structured — and
write our own implementation. We **ship none of tldraw's code**, copy no source, and depend on no
`@tldraw/*` package. Ideas and patterns are fair to learn from; code and assets are not. (An earlier
note on the ticket called the source "MIT-safe" — that was wrong; the safety comes from re-implementing,
not from the license.)

Facts below are grounded in tldraw's public SDK docs (tldraw.dev) and the v5.2.5 API.

## The current canvas, in one paragraph

`src/canvas/ReferenceCanvasPanel.tsx` (612 lines) holds everything: a flat `CanvasItem[]` in React state,
a single `PointerOperation` discriminated union that hand-codes every gesture (`draw | marquee | pan |
drag | resize | erase | laser`), a giant JSX switch that renders each item kind inline, and geometry
helpers in `canvasDomain.ts`. It works, but each new tool widens the union and the render switch, and the
"tools not 100% functional" complaint traces to gesture edge-cases living in one place with no per-tool
isolation. The patterns below are the antidotes.

---

## Pattern 1 — A reactive record store (vs one big `useState`)

**tldraw.** All canvas content is normalized **records** in a single reactive `Store`, keyed by typed ids
(`createShapeId()`). Views subscribe to derived signals (`atom`, `computed`, `EditorAtom`, `AtomMap`) and
re-render only when the records they read change. Side effects register centrally
(`editor.sideEffects.registerAfterDeleteHandler('shape', …)`), e.g. to clean up dependent data when a
record is deleted.

**Adapt.** Keep our existing `world.canvas.items` **serialization** shape, but model the in-memory
working set as a **normalized map** `Record<id, CanvasItem>` plus a derived ordered list, rather than an
array we `.map()` and rebuild on every edit. A tiny external store (we already use zustand elsewhere) or a
`useSyncExternalStore` hook gives us per-item subscription and cheaper drags. Central **delete side
effects** are where dangling links get pruned (Pattern 3).

**Simplify.** No migrations framework, no schema/versioning engine, no multiplayer/CRDT sync. One local
store, persisted via the existing repository (ticket [Canvas data model & persistence (custom)](https://github.com/luckramos/landforger/issues/84)).

## Pattern 2 — Tools as small state machines (vs one `PointerOperation` union)

**tldraw.** Every tool is a `StateNode` with `static id`, an `initial` child, and `children()` — typically
`Idle → Pointing → Dragging`. Nodes implement `onEnter/onExit/onPointerDown/onPointerMove/onPointerUp/
onDoubleClick/onCancel/onInterrupt` and `transition()` between siblings. The active tool receives input; a
finished tool calls `this.editor.setCurrentTool('select')`. Registered with `tools={[MyTool]}` and surfaced
in the UI via `overrides.tools`.

```ts
class DrawTool extends StateNode {
  static id = 'draw'
  static initial = 'idle'
  static children() { return [Idle, Drawing] }
  onEnter() { this.editor.setCursor({ type: 'cross' }) }
}
```

**Adapt.** Replace the monolithic `PointerOperation` union with a small **per-tool handler** interface —
`onPointerDown/Move/Up`, `onEnter/onExit` — one object per tool (`select`, `pencil`, `arrow`, `line`,
`shape`, `text`, `sticky`, `eraser`, `laser`, plus the node tools). The panel just routes pointer events
to `tools[current]`. This is the single biggest fix for "not 100% functional": each gesture's edge cases
live in isolation and are unit-testable on their own (interaction tests are back under a custom impl).
We don't need tldraw's nested child-state formalism — a flat handler object per tool is enough; reach for
an explicit `idle/active` sub-state only where a tool genuinely needs it (e.g. drag threshold).

**Feeds** ticket [Canvas rebuild: behavior audit & engine strategy](https://github.com/luckramos/landforger/issues/83).

## Pattern 3 — Bindings: how the loose N-to-N link should work

**tldraw.** A **binding** is a first-class record connecting two shapes: `createBinding({ id, type,
fromId, toId, props })`. `BindingUtil` lifecycle hooks keep dependents in sync:
`onAfterChangeFromShape` / `onAfterChangeToShape` fire when either bound shape moves (arrows use these to
reroute), and delete handlers drop the binding when an endpoint disappears. You query with
`editor.getBindingsToShape(shape, TYPE)` and remove with `editor.deleteBindings(...)`. Crucially the
binding is a **separate record**, not a property of either shape — which is exactly what makes N-to-N
natural: any number of bindings can reference the same shape id.

**Adapt (this is the core of the link feature).** Model a canvas **link** as its own record
`{ id, kind: 'link', fromId, toId }` — *not* a field on the nodes. Then:
- **N-to-N falls out for free**: many link records may share an endpoint id.
- **Geometry is derived, never stored**: the line is recomputed each render from the two endpoints' current
  rects (anchor at centers, or nearest edge points). No stored coordinates to keep in sync.
- **Reroute on move** is automatic because geometry is derived — no `onAfterChange` bookkeeping needed at
  our scale; the drag simply moves the endpoint item and the line re-derives.
- **Delete cleanup**: on item delete, the store's after-delete side effect (Pattern 1) removes every link
  whose `fromId`/`toId` matches — the equivalent of tldraw's binding cleanup, in ~5 lines.
- **Loose line, not arrow**: render a plain path (optional heads), canvas-local only — no domain/backlink
  participation, per the map's standing decisions.

**Feeds** ticket [Custom N-to-N loose link connector](https://github.com/luckramos/landforger/issues/85).

## Pattern 4 — Shape utils: per-kind modules (vs one render switch)

**tldraw.** Each shape kind is a `ShapeUtil` encapsulating its whole behavior: `static type`,
`getDefaultProps()`, `getGeometry()` (returns a `Geometry2d` like `Rectangle2d` used for hit-testing and
bounds), `component()`/`render()` (returns an `HTMLContainer` of arbitrary React), `indicator()` /
`getIndicatorPath()` (the selection outline), and `onResize()`. The editor holds a registry
`shapeUtils[type]` and dispatches to it.

**Adapt.** Split the inline render switch into a **per-kind module registry**: for each item kind
(`stroke`, `connector`, `shape`, `text`, `sticky`, and the new `link-node` / `pdf-node` / `md-node`) a
small object with `defaultProps`, `bounds/hitTest`, `render`, `onResize`. The panel maps items to
`registry[item.kind].render(item)`. Adding the PDF/MD/Link nodes then means adding a module, not editing a
612-line file. The custom node cards (favicon+title, page-count, md preview) are just each module's
`render`.

**Feeds** tickets [Custom nodes: Link / PDF / Markdown](https://github.com/luckramos/landforger/issues/86)
and the data model [Canvas data model & persistence (custom)](https://github.com/luckramos/landforger/issues/84).

## Pattern 5 — Ephemeral layers: laser & freeform (keep what we have)

**tldraw.** The laser trail is **ephemeral** — not a persisted record — rendered on its own reactive
layer and faded out on a timer; freeform draw uses `perfect-freehand` (MIT) for pressure/velocity-aware
stroke outlines.

**Adapt.** We already have `LaserTrailRenderer.ts` (rAF trail) and `smoothStrokePath` (quadratic
smoothing) — both are the right shape and stay. Keep laser strictly **out of the persisted store**
(ephemeral overlay), which the current code already does. Optional upgrade: adopt `perfect-freehand`
**directly** (its own MIT package, unrelated to the tldraw license) for nicer pencil strokes — a clean,
license-safe dependency if we want it; otherwise keep `smoothStrokePath`.

## Pattern 6 — Camera & coordinates (formalize the helpers)

**tldraw.** A single camera (`x, y, z`) converts page↔screen; input is tracked as page points
(`editor.inputs.getCurrentPagePoint()`), so tools reason in page space regardless of zoom/pan.

**Adapt.** We already have `screenToCanvasPoint` and `zoomViewportAt` in `canvasDomain.ts`. Formalize a
tiny **camera module** (`viewport {panX, panY, zoom}` + `screenToPage`/`pageToScreen`) that every tool
uses, so gestures never juggle raw client coordinates. Small refactor, removes a class of pan/zoom bugs.

---

## What to deliberately NOT adopt

- **No multiplayer / sync / presence.** Single local user.
- **No schema migration / versioning framework.** Extend the plain `canvas.items` shape; reseed, don't migrate.
- **No nested child-state formalism** unless a tool needs it — flat per-tool handlers are enough.
- **No general bindings engine.** One link kind with derived geometry, not a typed binding registry.
- **No `Geometry2d` class hierarchy.** Plain rect/segment hit-tests (we already have them in `canvasDomain.ts`).
- **No tldraw UI system.** Our own bottom toolbar and chrome in the LandForger design language.
- **No history/undo engine** unless the audit ticket decides it's in scope (it's a real question, not a given).

## Summary → downstream tickets

| Pattern | Adapt as | Feeds |
|---|---|---|
| Reactive record store | normalized `Record<id, item>` + external store, central delete side-effects | [data model](https://github.com/luckramos/landforger/issues/84) |
| Tool state machines | per-tool handler objects replacing `PointerOperation` union | [audit & engine strategy](https://github.com/luckramos/landforger/issues/83) |
| Bindings | link = its own `{fromId,toId}` record, derived geometry, delete-cleanup → N-to-N for free | [link connector](https://github.com/luckramos/landforger/issues/85) |
| Shape utils | per-kind render/bounds/resize module registry | [nodes](https://github.com/luckramos/landforger/issues/86), [data model](https://github.com/luckramos/landforger/issues/84) |
| Ephemeral laser/freeform | keep `LaserTrailRenderer` + `smoothStrokePath`; optional `perfect-freehand` (MIT) | [audit](https://github.com/luckramos/landforger/issues/83) |
| Camera/coords | formalize a `viewport` + `screenToPage` module | [audit](https://github.com/luckramos/landforger/issues/83) |

**One-line takeaway for the engine-strategy decision:** the three ideas that most repay a ground-up rebuild
are *(1)* a link as its own record with derived geometry (makes N-to-N and reroute trivial), *(2)* per-tool
handlers (kills the gesture edge-cases), and *(3)* a per-kind render registry (makes the PDF/MD/Link nodes
additive). Everything else can stay close to today's code.
