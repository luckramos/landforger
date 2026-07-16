# OKLCH color system + token consolidation (better-colors)

LandForger's color is one system that had been expressed in two half-languages: the deliberate parts (Category colors, `--danger`, the genre formula, the `color-mix(in oklab …)` blends) were already OKLCH, while surfaces, the bronze accent, the text/hairline ladders, and ~45 scattered component values were still opaque hex/rgba where drift is invisible. Ratified by PRD #58, which migrated theme colors to OKLCH and consolidated hand-rolled colors onto tokens — a *faithful* conversion (appearance unchanged) plus consolidation plus one bugfix. The rules below are the durable standard.

## Rules

- **Theme colors are authored in OKLCH.** Surfaces, the bronze accent, the `--text-*`/`--ornament` alpha ladder, hairlines, and component neutrals are expressed as `oklch(L C H / α)`, so lightness/chroma/hue can be adjusted independently and drift is visible. New theme colors follow suit.
- **Use tokens, not hand-rolled values.** One `--laser` for the pointer (not three near-identical reds), one `--scrim` for every overlay/dimming (not scattered black/tinted-black rgba), the `--danger` family for every error state (Auth included — no bespoke rgba red). A component neutral within ~ΔL 0.02 of a panel token references the token instead of duplicating it.
- **`var()` of a theme token carries a fallback.** `var(--token, <fallback>)` for theme tokens, as defense-in-depth against the "invisible variable" class of bug — a token used but never defined (`--bronze-hi`) is invalid at computed-value time and silently falls back to transparent/inherited. Keep `--bronze-hi` (and any referenced token) defined.
- **The token test asserts contrast, not literal strings.** `src/__tests__/tokens.test.ts` asserts foreground/background contrast ratios clear the WCAG/APCA floor — including faint labels against the *lighter* panels (`--panel-3`), not only `--bg`. A value tweak that preserves legibility must pass; one that breaks it must fail. It also guards that referenced tokens stay defined.

## Explicitly out of scope (do not "fix" incidentally)

- Respacing or renaming the surface ramp (`--panel-*` name-inversion / hue drift) — deferred to a separate design decision; it changes appearance and every consumer.
- Unifying the warm/cool neutral temperature split (Canvas/Graph hue ~286 vs Map/panel ~68) — recorded as an observation only.
- The Category color system, genre formula, and `color-mix(in oklab …)` blends — already correct OKLCH; untouched.
- Stored user colors: World `color`, Canvas item colors, the 12-swatch Canvas palette — user data / free-choice, not theme tokens; kept verbatim.
- Black drop-shadows and P3/wide-gamut variants — no perceptual benefit / not needed (all values are sRGB, low-to-moderate chroma).

## Verification

CSS-only apart from the test rewrite; verified by `pnpm typecheck` + `pnpm build` + the full suite green. The "looks identical" claim is confirmed manually (happy-dom has no paint engine; chrome-devtools unavailable in WSL). The `--bronze-hi` fix is the one change with a *visible* effect — call it out in any PR.
