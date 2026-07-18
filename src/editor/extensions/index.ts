// The 13 v1 blocks (no Table, no Code block — cut from v1), wired for both
// the live editor and the headless markdown codec. Ported from the validated
// spike (landforger-spike/prototype-tiptap-spike/src/extensions.ts).
//
// Blocks: Text, H1, H2, H3, Bulleted list, Numbered list, To-do, Quote,
// Callout (custom), Toggle (Details), Divider, Image, Wikilink chip.
// Marks beyond StarterKit's set: Highlight (the toolbar's highlight button;
// ships its own `==text==` markdown spec).
//
// All input rules stay on except the code fence — disabling StarterKit's
// codeBlock removes that input rule with the node.

import type { AnyExtension } from '@tiptap/core'
import { Placeholder } from '@tiptap/extensions'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TaskList } from '@tiptap/extension-list'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { Callout } from './Callout'
import { TableWithTools } from './TableView'
import { CheckboxTaskItem } from './TaskItemView'
import { CodeFenceAsText } from './CodeFenceAsText'
import { MarkdownAutoConvert } from './MarkdownAutoConvert'
import { MarkdownLinkRule } from './MarkdownLinkRule'
import { TabIndent } from './TabIndent'
import { buildWikiLinkSuggestions, WikiLink } from './WikiLink'
import { SlashCommands } from './SlashCommands'
import type { WikiLinkRegistry } from '../WikiLinkRegistry'

export interface BlockExtensionOptions {
  /**
   * Keep the parse-side degradation guard on (default). Only the codec's
   * regression test turns it off, to document what `@tiptap/markdown` does
   * without it (silently drops fenced code).
   */
  codeFenceGuard?: boolean
  /** Live title lookup for wikilink chips — see `WikiLinkOptions.resolveTitle`. */
  resolveTitle?: (slug: string) => string | undefined
  wikiLinkRegistry?: WikiLinkRegistry
  onWikiLinkNavigate?: (slug: string) => void
  /** Empty-document prompt. Omitted for headless codec use. */
  placeholder?: string
}

/** The shared block set: one schema for the editor and the codec — they must never diverge. */
export function buildBlockExtensions(opts: BlockExtensionOptions = {}): AnyExtension[] {
  const { codeFenceGuard = true, resolveTitle, wikiLinkRegistry, onWikiLinkNavigate, placeholder } = opts
  return [
    ...(placeholder ? [Placeholder.configure({ placeholder, emptyNodeClass: 'is-empty-node' })] : []),
    StarterKit.configure({
      codeBlock: false, // no Code block in v1
      link: { openOnClick: false },
    }),
    TaskList,
    CheckboxTaskItem.configure({ nested: true }),
    Image,
    // persist: true registers the `open` attribute — without it the extension
    // returns no attributes and `open` can't be set, so a toggle can't be
    // inserted (or saved) in an expanded state.
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    Callout,
    TableWithTools,
    TableRow,
    TableHeader,
    TableCell,
    Highlight,
    resolveTitle || wikiLinkRegistry || onWikiLinkNavigate
      ? WikiLink.configure({
          ...(resolveTitle ? { resolveTitle } : {}),
          ...(wikiLinkRegistry ? { registry: wikiLinkRegistry } : {}),
          ...(wikiLinkRegistry ? { suggestions: buildWikiLinkSuggestions(wikiLinkRegistry) } : {}),
          ...(onWikiLinkNavigate ? { onNavigate: onWikiLinkNavigate } : {}),
        })
      : WikiLink,
    SlashCommands,
    TabIndent,
    MarkdownLinkRule,
    MarkdownAutoConvert,
    ...(codeFenceGuard ? [CodeFenceAsText] : []),
  ]
}

export { Callout } from './Callout'
export { CodeFenceAsText } from './CodeFenceAsText'
export { WikiLink, type WikiLinkOptions } from './WikiLink'
export { SlashCommands, slashCommandsPluginKey } from './SlashCommands'
