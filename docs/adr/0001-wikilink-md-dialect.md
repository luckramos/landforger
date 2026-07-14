# Wikilinks (`[[slug]]`) as the Markdown link dialect

Pages are Markdown files meant to outlive this front-end (Obsidian-compatible, readable in any MD viewer), so inline page links serialize as `[[slug]]` — not the zero-cost `[mention id="slug" label="…"]` shortcode that `@tiptap/markdown` ships and that the tiptap research recommended as baseline. We accepted ~1 day of custom tokenizer work plus escaping risk in exchange for portable, human-readable files; the tiptap spike (issue #15) validates exactly this path before the PRD locks. Labels are never baked into the file: chips render the live title looked up by slug, so renames rewrite nothing.

## Considered Options

- `[mention id label]` shortcode — zero work, robust attrs, but tiptap-flavored noise in every file.
- `[[slug|Label]]` — readable fallback label, but the label goes stale on rename; rejected to keep files canonical-by-slug.
