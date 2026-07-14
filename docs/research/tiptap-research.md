---
title: Tiptap research — slash menu, Markdown round-trip, wikilinks
date: 2026-07-13
ticket: https://github.com/luckramos/landforger/issues/4
companions: design-inventory.md, animation-catalog.md
---

# Tiptap research: slash menu, Markdown round-trip, wikilinks

Research pass against primary sources: tiptap.dev docs (read from the `ueberdosis/tiptap-docs` source repo for exact text), the `ueberdosis/tiptap` monorepo source, the npm registry (versions/dates/licenses queried 2026-07-13), prosemirror-markdown docs, and community repos. Every load-bearing claim is cited. Where a claim rests on reading extension source, the repo path is given.

---

## 1. Verdict

**Yes — tiptap v3 can deliver all three hard requirements, entirely on MIT-licensed packages.** The two historical blockers are gone: the formerly-Pro Details (toggle) extension was open-sourced under MIT in June 2025 ([blog](https://tiptap.dev/blog/release-notes/were-open-sourcing-more-of-tiptap), [HN: "Tiptap open-sources 10 formerly Pro extensions under MIT license"](https://news.ycombinator.com/item?id=44202103); npm shows `@tiptap/extension-details` 3.27.4, MIT), and an **official first-party Markdown package now exists**: `@tiptap/markdown`, introduced in v3.7.0 (npm: created 2025-10-14, MIT), providing bidirectional Markdown ↔ tiptap-JSON conversion ([docs](https://tiptap.dev/docs/editor/markdown)). The catch: the docs explicitly label it *"a early release and can be subject to change or may have edge cases that may not be supported yet"* ([markdown/index.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/index.mdx)), and its serializer **silently drops any node that lacks a markdown handler** (source: `packages/markdown/src/MarkdownManager.ts`, `renderNodeToMarkdown`: `if (!handler) { return '' }`). That single fact drives most of the risk section and the prototype verdict.

Current version facts (npm registry, 2026-07-13): tiptap v3 is the current major; latest release **3.27.4, published 2026-07-13** (weekly-ish cadence; 3.27.0 on 2026-06-17). v3.0 stable shipped July 2025 (3.0.1: 2025-07-12). v2 is in maintenance (last stable 2.27.2, 2026-01-07). All `@tiptap/*` packages we need are MIT.

### Requirement coverage table

| # | Design item | Tiptap node/extension | Package | Status |
|---|---|---|---|---|
| 1 | Text | `paragraph` (core node) | `@tiptap/starter-kit` | **Free (MIT)** |
| 2 | H1 | `heading` level 1 | `@tiptap/starter-kit` | **Free (MIT)** |
| 3 | H2 | `heading` level 2 | `@tiptap/starter-kit` | **Free (MIT)** |
| 4 | H3 | `heading` level 3 | `@tiptap/starter-kit` | **Free (MIT)** |
| 5 | Bulleted list | `bulletList` + `listItem` | `@tiptap/extension-list` (in StarterKit) | **Free (MIT)** |
| 6 | Numbered list | `orderedList` | `@tiptap/extension-list` (in StarterKit) | **Free (MIT)** |
| 7 | To-do | `taskList` + `taskItem` | `@tiptap/extension-list` (task nodes not in StarterKit — add explicitly) | **Free (MIT)** |
| 8 | Quote | `blockquote` | `@tiptap/starter-kit` | **Free (MIT)** |
| 9 | **Callout** | — none official — | custom `Node` (~50 LOC) + `createBlockMarkdownSpec` | **Custom** (docs provide a literal Callout example) |
| 10 | **Toggle** | `details`/`detailsSummary`/`detailsContent` | `@tiptap/extension-details` | **Free (MIT)** — formerly Pro, open-sourced June 2025 |
| 11 | Divider | `horizontalRule` | `@tiptap/starter-kit` | **Free (MIT)** |
| 12 | Image | `image` | `@tiptap/extension-image` (upload UI is ours) | **Free (MIT)** |
| 13 | Table | `table` family | `@tiptap/extension-table` (`TableKit`) | **Free (MIT)** |
| 14 | Code | `codeBlock` | StarterKit; `@tiptap/extension-code-block-lowlight` for highlighting | **Free (MIT)** |
| 15 | Mention | `mention` | `@tiptap/extension-mention` + `@tiptap/suggestion` | **Free (MIT)** |
| — | Slash "/" menu | `@tiptap/suggestion` utility + our React list | build ourselves | **Free (MIT)** — the *prebuilt* `SlashDropdownMenu` UI component is **paid** (marked `isFree: false`, "Start plan" tag in [slash-dropdown-menu.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/ui-components/components/slash-dropdown-menu.mdx)) |
| — | @-mention chip w/ hover card | `Mention` + `ReactNodeViewRenderer` | `@tiptap/react` | **Free (MIT)** + custom pill component |
| — | `[[wikilink]]` trigger | second entry in `Mention.configure({ suggestions: [...] })` with `char: '[['` | config only | **Free (MIT)** — multi-char triggers confirmed in source |
| — | MD body round-trip | `Markdown` extension | `@tiptap/markdown` | **Free (MIT), beta** — the main risk carrier |
| — | YAML frontmatter | **not handled by tiptap** — strip/reattach in the repository layer | e.g. `gray-matter` | **Custom (trivial)** — validates the properties-panel assumption |

Paid ("Start plan") things we would only touch if we wanted them: the prebuilt UI component set around the Notion experience (`SlashDropdownMenu`, `MentionDropdownMenu`, `DragContextMenu`, `TurnIntoDropdown`, …) and the [Notion-like editor template](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/ui-components/templates/notion-like-editor.mdx), which states *"requires at least a Start plan subscription to use in production"* and is wired to Tiptap Cloud (collab/AI JWTs). The [Simple Editor template](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/ui-components/templates/simple-editor.mdx) and its components are MIT. Also note `@tiptap/extension-table-of-contents` is still proprietary (npm license: "SEE LICENSE IN LICENSE.md") — we don't need it.

---

## 2. Deep dives

### 2.1 Slash command menu

**Mechanics.** There is no "slash command" extension in core; the sanctioned pattern is the `@tiptap/suggestion` utility (MIT, the same engine behind Mention). You create a small `Extension` whose `addProseMirrorPlugins` returns `Suggestion({ char: '/', ... })`, with `items({ query })` returning the filtered block list and `command({ editor, range, props })` deleting the trigger range and running the chosen insertion. This is exactly how tiptap's own paid `SlashDropdownMenu` works internally — its hook doc shows `<SuggestionMenu char="/" items={...}>` ([slash-dropdown-menu.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/ui-components/components/slash-dropdown-menu.mdx)).

**Rendering the menu (the docs have moved on from tippy.js).** v3 removed tippy.js in favor of floating-ui ([What's new in V3](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/resources/whats-new.mdx): *"Migration from tippy.js to floating-ui"*). Since **v3.27.0 (2026-06-17)** the Suggestion utility does the positioning itself: `render().onStart(props)` receives `props.mount(element)` which mounts, positions, and auto-anchors the popup via floating-ui (`placement`, `offset`, `flip` options), plus async `items({ query, signal })` with `debounce`, `minQueryLength`, `initialItems`, and abort signals ([suggestion.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/utilities/suggestion.mdx), [releases](https://github.com/ueberdosis/tiptap/releases)). The React side pairs this with `ReactRenderer` from `@tiptap/react`. So: no tippy, no manual `clientRect` juggling — this got materially easier a month ago.

**One utility, three triggers.** Multiple Suggestion instances coexist if each has its own `pluginKey` (default key is the shared `'suggestion'` — must override; [suggestion.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/utilities/suggestion.mdx)). Mention additionally accepts a `suggestions` **array** to register several triggers on one node type ([mention.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/nodes/mention.mdx)) — that's our `@` + `[[` pair, with `/` as a separate slash extension.

**The 15 blocks.** Per the table above: 11 of 15 are StarterKit-or-adjacent free extensions (StarterKit v3 already bundles paragraph, heading, blockquote, code block, horizontal rule, lists, link, underline, undo/redo — verified in `packages/starter-kit/src/starter-kit.ts`). To-do needs TaskList/TaskItem added; Image and Table are free add-ons; **Toggle** is `@tiptap/extension-details` (three nodes: `Details`, `DetailsSummary`, `DetailsContent`, with a vanilla-JS node view for the open/close button built in — `packages/extension-details/src/details.ts`); **Callout is the only custom node**, and the markdown docs ship a copy-pasteable Callout/Admonition example (see 2.2).

**Risks.** Low. The only real decisions are UX ones (keyboard nav, grouping). Budget note: build the menu ourselves (~a day with `props.mount`) rather than paying for the Start-plan component.

### 2.2 Markdown round-trip

**Assumption stated up front:** frontmatter maps to page properties edited in a properties panel outside the editor, so the editor only round-trips the MD *body*. **This assumption is correct and, in fact, forced:** the `@tiptap/markdown` docs (index, basic-usage, API pages — checked in full) never mention YAML/frontmatter, and its MarkedJS lexer has no frontmatter concept. The repository layer must split frontmatter from body on load (`gray-matter` or `remark-frontmatter`) and re-prepend it on save. That layer also becomes the natural owner of "properties" reads/writes, cleanly decoupled from tiptap.

**The official story (new since Oct 2025).** `@tiptap/markdown` (MIT, first release v3.7.0 on 2025-10-14; announced as ["Bidirectional Markdown Support"](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap)) is a real serializer/parser, not an HTML detour: MarkedJS lexer → tokens → per-extension `parseMarkdown` handlers → tiptap JSON, and back via per-extension `renderMarkdown` ([architecture diagram in markdown/index.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/index.mdx)). API surface: `editor.getMarkdown()`, `contentType: 'markdown'` on `setContent`/`insertContent`, and a headless `editor.markdown.parse()` / `editor.markdown.serialize(json)` manager that "works identically in browser and server environments" ([basic-usage.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/getting-started/basic-usage.mdx)). GFM (tables, task lists) via `Markdown.configure({ markedOptions: { gfm: true } })`; taskItem serializes `- [x]` / `- [ ]` ([api/utilities.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/api/utilities.mdx)).

**Custom nodes are first-class**, with three helpers exported from `@tiptap/core` (`packages/core/src/utilities/markdown/`):
- `createBlockMarkdownSpec` — Pandoc-style fenced containers `:::name {attr="value"} … :::`. The docs' worked example **is literally a Callout node** with `type`/`title` attributes ([api/utilities.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/api/utilities.mdx)); there's also a four-step [Admonition guide](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/guides/create-a-admonition-block.mdx) covering custom tokenizer → parser → serializer.
- `createInlineMarkdownSpec` — shortcode syntax `[name attr="value"]content[/name]`, or self-closing `[mention id="madonna" label="Madonna"]` (source: `createInlineMarkdownSpec.ts` docblock).
- `createAtomBlockMarkdownSpec` for atom blocks.

The official extensions already use these: **Mention ships a markdown spec** (`packages/extension-mention/src/mention.ts` line ~279: `createInlineMarkdownSpec({ nodeName: 'mention', name: '@', selfClosing: true, allowedAttributes: ['id', 'label', { name: 'mentionSuggestionChar', skipIfDefault: '@' }] })`), **Details/Summary/Content each ship `createBlockMarkdownSpec`** (verified in all three source files), and Image has `parseMarkdown`/`renderMarkdown` (`packages/extension-image/src/image.ts`). So the full 15-block set + mentions round-trips **out of the box**, in a tiptap dialect.

**Key risks, assessed:**

1. **Silent lossiness for unhandled nodes.** `MarkdownManager.renderNodeToMarkdown` returns `''` when no handler is registered for a node type (`packages/markdown/src/MarkdownManager.ts`) — the node and its subtree vanish from the saved file with no error. HTML fallback exists on *parse* (HTML inside MD is parsed via extensions' `parseHTML` — [basic-usage.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/getting-started/basic-usage.mdx)) but **not on serialize**. Mitigation: every custom node must ship a markdown spec, plus a CI round-trip test per node type; consider a save-time invariant check (walk doc, assert every node type has a registered renderer).
2. **Whitespace/escaping stability — byte-identical load→save is NOT guaranteed and should not be assumed.** The serializer regenerates markdown from JSON (normalizing list markers, escapes, indentation — `indentation` is even a config option, [api/extension.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/api/extension.mdx)). Evidence of active churn in exactly this area: 3.25.0 "fixed backslash-escape handling in parser and serializer", 3.27.2 heading-after-list parse fix, 3.27.3 block-after-ordered-list nesting fix ([releases](https://github.com/ueberdosis/tiptap/releases), June–July 2026). The realistic target is **idempotence** (`serialize(parse(x))` stable after one normalization pass), not byte-identity with hand-written files. Mitigation for the mock-repo: only write the body when the tiptap doc actually changed (dirty flag), and accept a one-time normalization on first edit of a page.
3. **Beta status.** The docs banner ("early release … subject to change") is 9 months old and still present. Pin minor versions; keep the serialization behind our own `PageBodyCodec` interface so the pipeline is swappable.
4. **Dialect portability.** `[mention id="frodo"]` shortcodes and `:::callout` containers are tiptap-flavored MD; other renderers show them as literal text (readable, not broken). If Obsidian-grade interop ever matters, custom tokenizers can emit `[[slug]]` instead (supported via `markdownTokenizer` — [custom-tokenizer docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/advanced-usage/custom-tokenizer.mdx)).
5. **Documented limitations:** table cells limited to a single child node; merged cells (colspan/rowspan) can't survive `getMarkdown()` because pipe tables can't express them ([markdown/index.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/index.mdx), conversion docs).

**Alternatives considered:**
- **`tiptap-markdown` (community, aguingand)** — deprecated by its own author: the README now says *"Tiptap released a markdown extension in 3.7.0, please prefer using the official extension over this package. I don't plan to address current issues / PR."* ([repo](https://github.com/aguingand/tiptap-markdown), latest 0.9.0, 2025-09-08). Ruled out.
- **`prosemirror-markdown`** (MIT, 1.13.5, 2026-07-06) — the mature bedrock: markdown-it parser + explicit `MarkdownSerializer` where unhandled nodes **throw** instead of vanishing. But it ships only the CommonMark schema; every tiptap extension node (task lists, tables, details, mention, callout) needs hand-written token mappings, and it's now maintained off-GitHub ([repo moved to code.haverbeke.berlin](https://github.com/ProseMirror/prosemirror-markdown)). Viable **fallback** if the official beta disappoints; not the starting choice.
- **Hand-rolled remark/unified pipeline** — maximum control (and the only route to first-class `[[wikilink]]`/frontmatter AST work via `remark-frontmatter`/`remark-gfm`), but we'd own MD↔ProseMirror mapping for ~18 node types in both directions. Not justified while the official extension exists; keep as the escape hatch behind `PageBodyCodec`.

**Recommendation:** official `@tiptap/markdown`, GFM on, wrapped in our own codec interface, with idempotency + no-loss tests as a merge gate.

### 2.3 Inline link nodes powering backlinks (@-mention chips, `[[` secondary)

**Primary pattern — Mention chips.** `@tiptap/extension-mention` (MIT) is an inline atom node with attrs `id`, `label`, `mentionSuggestionChar` (stored as `data-id`/`data-label` in HTML — `packages/extension-mention/src/mention.ts`). Autocomplete comes from the bundled Suggestion config; rendering is fully replaceable. For the design's icon+title pill with hover preview card, use `addNodeView() => ReactNodeViewRenderer(MentionPill)` — the standard React node-view path ([node-views/react docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/custom-extensions/node-views/react.mdx)). We extend Mention rather than write a node from scratch.

**`[[` secondary trigger costs ~zero:** Suggestion's `char` is any string — the matcher regex-escapes it and slices the query with `char.length` (`packages/suggestion/src/findSuggestionMatch.ts`), and Mention's `suggestions: [{ char: '@', … }, { char: '[[', … }]` array exists precisely for multiple triggers ([mention.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/nodes/mention.mdx)). Both triggers insert the *same* mention node, so `[[` is an input affordance, not a second node type. (Prior art for a true wikilink node: [aarkue/tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension) — v2-era, unpublished to npm; reference only.)

**Serialization to MD.** Out of the box a chip round-trips as the self-closing shortcode **`[mention id="slug" label="Page Title"]`** (attribute allowlist above; `mentionSuggestionChar` omitted when it's `@`). Parse-back is handled by the same spec's tokenizer. Options if we want different MD:
- keep the default shortcode (zero work, robust attrs) — **recommended for the PRD baseline**;
- override the spec to emit `[[slug]]` (custom `markdownTokenizer` + `renderMarkdown`, ~a day, dialect risk vs. link syntax `[text](url)` needs care);
- `[title](page:slug)` standard-link flavor — renders as a link in external viewers but abuses the Link mark vs. atom-node semantics; not recommended for chips.

**Backlinks derivation.** Since pages are stored as MD strings behind the repository, derive the backlink index by scanning stored MD for mention tokens — the shortcode is regular (`\[mention ([^\]]*)\]`) and cheap to regex at index time, or, more robustly, parse headlessly with the `MarkdownManager` (`editor.markdown.parse()` runs server-side per docs) and walk the JSON for `type: 'mention'`. Walking the live tiptap doc is only needed for the *open* page (live backlink updates on edit). Index maps `mention.id → referencing page ids`.

**Rename propagation.** The chip stores `id` (slug — stable) and `label` (title — baked into the MD at insert time). Recommended: treat **id as authoritative and derive the displayed title at render time** in the pill node view (lookup by id against the page store), keeping `label` merely as a fallback for plain-MD readability. On rename, referencing files still hold the stale `label` string; run a background "label refresh" rewrite (find shortcodes with `id=X`, update `label`) or simply accept staleness in raw MD since the editor always displays the live title. Either way, **no user-visible breakage on rename** — that's the payoff of id-bearing chips over bare `[[Title]]` text links, where rename means rewriting every referencing file or breaking links.

### 2.4 React integration & performance

- `@tiptap/react` v3: `useEditor`, `EditorContent`, `ReactNodeViewRenderer`, `ReactRenderer` (for suggestion popups). v3 defaults `shouldRerenderOnTransaction: false` — the editor component no longer re-renders on every keystroke; subscribe to state slices with `useEditorState` selectors ([performance guide](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/performance.mdx), [whats-new.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/resources/whats-new.mdx)).
- Node views render synchronously and the docs warn that *many* React node-view instances get expensive ([performance.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/performance.mdx)). Mention pills will be the most numerous node view on a wiki page: keep the pill a static, memoized span (icon + title) and mount the hover preview card lazily on `mouseenter` (portal), not per-chip. Details ships a plain-DOM node view (no React cost); keep Callout plain-DOM too if it needs no interactivity. Medium documents (a few thousand nodes, dozens of chips) are well within tiptap's envelope under these rules.

### 2.5 Versions, licensing, migration facts

- **v3 = current major** (3.27.4, 2026-07-13; MIT). v2 maintenance-only (2.27.2, 2026-01-07). Starting fresh today means v3-only; no migration debt. The v2→v3 facts that shape code we write: tippy.js → floating-ui; utility extensions consolidated into `@tiptap/extensions` (History renamed **UndoRedo**); richer StarterKit (includes Link, Underline, lists); `TableKit`/`ListKit` bundles; stricter TS; `getPos()` can return `undefined` in node views; Static Renderer can render JSON → HTML/Markdown/React without an editor instance ([whats-new.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/resources/whats-new.mdx)).
- **Licensing:** every required package is MIT (verified per-package on the npm registry, 2026-07-13). Paid surface = Tiptap Cloud features (collab, AI, comments), the Start-plan UI component/template set, and stragglers like `extension-table-of-contents` (proprietary license) — none required here.
- **Reference implementations:** [steven-tey/novel](https://github.com/steven-tey/novel) (Apache-2.0, 16.4k stars — Notion-style tiptap editor with slash menu; note: dormant since 2025-01, v2-era patterns incl. tippy); [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote) (~10k stars, "block-based (Notion style)… built on top of Prosemirror and Tiptap"; license not machine-readable (GitHub: NOASSERTION) — read before copying code); tiptap's own [Notion-like template](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/ui-components/templates/notion-like-editor.mdx) (paid, but its public preview is the best UX reference for our slash/drag/turn-into interactions).

---

## 3. Recommended architecture sketch

**Packages** (all MIT):

```
@tiptap/react  @tiptap/core  @tiptap/pm  @tiptap/starter-kit
@tiptap/extension-list        (TaskList, TaskItem — to-do blocks)
@tiptap/extension-image
@tiptap/extension-table       (TableKit)
@tiptap/extension-details     (Toggle: Details, DetailsSummary, DetailsContent)
@tiptap/extension-mention  @tiptap/suggestion
@tiptap/extension-code-block-lowlight + lowlight   (code highlighting, optional)
@tiptap/extensions            (Placeholder, CharacterCount as needed)
@tiptap/markdown              (body codec)
gray-matter                   (frontmatter split/join in repository layer)
```

**Custom-node inventory** (deliberately tiny):
1. `Callout` — new block node (`type` attr: info/warning/…), plain-DOM render, `...createBlockMarkdownSpec({ nodeName: 'callout', allowedAttributes: ['type'] })` → `:::callout {type="warning"}` MD. Straight from the docs' example.
2. `PageMention` — `Mention.extend()` with `ReactNodeViewRenderer(MentionPill)` (icon + live title by id, lazy hover card), `suggestions: [{char:'@'},{char:'[['}]`, unique plugin keys. Markdown spec inherited (`[mention id label]`).
3. `SlashCommands` — thin `Extension` wrapping `Suggestion({ char: '/', pluginKey: slashKey })` + React list via `ReactRenderer` + `props.mount()`. Items array = the 15 blocks.

**Serialization pipeline** (the repository owns everything outside the body):

```
page.md ──gray-matter──▶ { frontmatter → properties panel state }
                         { body ──editor.markdown.parse()──▶ tiptap JSON }
edit… ──editor.getMarkdown()──▶ body' ──gray-matter.stringify(properties)──▶ page.md
```

Wrap parse/serialize in a `PageBodyCodec` interface (impl: `TiptapMarkdownCodec`) so a prosemirror-markdown or remark fallback stays a drop-in. Backlink indexer: regex or headless `MarkdownManager.parse` over stored MD for `type:'mention'` ids; live doc walk only for the open page. Save policy: write only when the doc changed; expect one-time normalization diff on first edit of legacy files.

---

## 4. Prototype verdict

**Yes — a throwaway prototype is warranted before the PRD commits, narrowly scoped to the Markdown codec and the triple-trigger suggestion stack.** The slash menu and the block set are proven ground (skip prototyping them beyond what falls out for free); but `@tiptap/markdown` is officially beta with active parser bugfixes as recent as this month, its serializer drops unhandled nodes *silently*, and the mention-shortcode dialect interacting with `[[`-triggered insertion is a novel combination nobody's reference implementation exercises. Those are exactly the "cheap to test, expensive to discover in month three" risks. Budget: 2–3 days, one spike branch, no UI polish.

The prototype must answer these acceptance questions:

1. **Round-trip integrity:** For a fixture page using all 15 block types + mention chips (incl. mentions inside callouts/toggles/table cells), does `parse → serialize` lose zero nodes, and is `serialize(parse(x))` idempotent after one normalization pass (second pass byte-identical to the first)? What does the normalization diff on a hand-written page look like — acceptable for a git-backed vault?
2. **Triple-trigger coexistence:** Do `/`, `@`, and `[[` suggestion instances (three plugin keys, two on one Mention node) coexist without swallowing each other's triggers or breaking undo — including `[[` immediately after text, and typing a literal `[` without popup misfires?
3. **Dialect collisions:** Does typed literal text that *looks* like the shortcode (`[mention id="x"]`) or like a wikilink (`[[not a link]]`) escape correctly on serialize and NOT materialize as a chip on the next load? (This is the escaping-stability bug class the 3.25.0 changelog fixed once already.)
4. **Chip rename model:** With `label` derived at render time (id-authoritative pill), does a page rename propagate visually with zero MD rewrites, and does the backlink indexer built on the shortcode regex agree with a headless-parse walk on the same corpus?

Pass all four → graduate the patch: PRD commits to tiptap v3 + `@tiptap/markdown` as specified above. Fail #1 or #3 → keep tiptap (requirements 1 and 3 stand regardless) but swap the codec seam to prosemirror-markdown with hand-written mappings, and re-scope the serialization estimate upward before the PRD locks.
