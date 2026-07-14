# LandForger

A worldbuilding wiki where Pages are the central concept and Markdown files are the source of truth. Backlinks, maps, a timeline, and a relationship graph are all derived views over the Pages of a World.

## Language

### Core

**World**:
The top-level container a user works inside: its Pages, Eras order, Category Templates, Maps, and Pins. Each World is itself a Markdown artifact.
_Avoid_: project, workspace, vault

**Page**:
One entity of the world — a Markdown file with YAML frontmatter (its Properties) and a rich-text body. Every Page belongs to exactly one Category.
_Avoid_: entry, document, note, article

**Category**:
One of the seven fixed kinds of Page: Stories, Eras, Characters, Locations, Items, Organizations, Events. Fixed set; a Page's Category can be changed after creation.
_Avoid_: type, kind, collection

**Slug**:
A Page's stable identity: kebab-case, generated from the title at creation, immutable thereafter. Renaming a Page changes its title, never its Slug. Collisions resolve by suffix (`sera-2`).
_Avoid_: id, permalink

### Linking

**Wikilink**:
An inline reference to a Page by Slug, stored in the Markdown body as `[[slug]]`. Rendered in the editor as a chip (pill with category icon + live title); inserted via `@` or `[[` autocomplete.
_Avoid_: mention (the design's term for the same chip), internal link

**Relation**:
A Property whose value is a list of Slugs, optionally constrained to target Categories (e.g. a Character's `affiliations` → Organizations).
_Avoid_: reference field, link property

**Backlink**:
A derived, inverse index entry: Page A backlinks Page B when A's body contains a Wikilink to B **or** any of A's Relations lists B. Powers the "Mentioned in" panel and the graph's edges.

**Ghost link**:
A Wikilink or Relation whose target Slug no longer exists (Page deleted). It stays in the file, renders as a broken link, and reconnects if a Page with that Slug is recreated.
_Avoid_: dead link, orphan

### Properties

**Property**:
A frontmatter field of a Page. Shared Properties exist on every Page: title, category, tags, summary, cover (optional), eras, plus system-maintained created/updated. Everything else is a Custom Property.

**Custom Property**:
A user-defined, typed Property beyond the shared set. Types: text, textarea, select, relation, image, number, date. Freely added, edited, renamed, and removed per Page.
_Avoid_: field, attribute, metadata

**Category Template**:
A World-editable set of Custom Properties that new Pages of a Category are born with. The design's per-category schemas are the default seed. Pages may diverge from their template freely.
_Avoid_: schema (implies enforcement — templates only seed)

### Time

**Era**:
A Page of the Eras category that also occupies a position in the World's ordered timeline. An Era's span is its relative order plus a free-text Date Label — no numeric axis, no start/end.
_Avoid_: period, age, epoch

**Date Label**:
An Era's free-text description of when it is ("Year 512 of the Ember Cycle"). Display-only; carries no ordering semantics.
_Avoid_: date, timestamp

**Timeless**:
The state of a Page whose `eras` list is empty. Timeless Pages don't appear on the timeline; their Pins stay visible on Maps regardless of the selected Era.
_Avoid_: era-less, undated, "member of all eras" (the design prototype's workaround — not our model)

**Active Era**:
The one Era currently selected in a World — exactly one at all times, shared by the timeline and every Map, persisted per World. Defaults to the last Era in the order (the world's "present").
_Avoid_: selected era, current era

### Space

**Map**:
An image owned by a World that Pages can be pinned onto. A Map may be era-linked (one image per Era, crossfading as the Active Era changes; missing images fall back to the nearest earlier Era's) or single-image. Maps form a hierarchy: each World has one Root Map, and a Pin can open a child Map at any depth.

**Root Map**:
The Map a World's "World map" entry opens — the top of the Map hierarchy. Changeable via the Map Library.

**Map Library**:
The gallery of all of a World's Maps: list, rename, delete, re-parent, and set the Root Map. Deleting a Map removes its Pins; its orphaned child Maps return to the Library.

**Pin**:
A placement of a Page on a Map at percentage coordinates. A Pin is born with its Page's Eras and may be narrowed to a subset; a Page may have several Pins on one Map (different positions per Era) and across Maps. Visible when its Page is Timeless, or when the Active Era is in both the Pin's list and the Page's current Eras.
_Avoid_: marker, map pin (redundant — a Pin is always on a Map)
