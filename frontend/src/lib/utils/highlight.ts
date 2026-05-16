// Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only.

/**
 * Whitespace-flexible passage highlighting over rendered DOM. Used by
 * every document renderer (PDF text layer, DOCX, plain text) to mark a
 * cited quote — the quote often differs from the rendered text in
 * whitespace and line breaks, so matching collapses whitespace runs.
 */

const MARK_CLASS = 'doc-hl'

/** Remove any highlight marks previously added inside `container`. */
export function clearHighlights(container: HTMLElement): void {
  for (const mark of Array.from(container.querySelectorAll(`mark.${MARK_CLASS}`))) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
}

interface NodeSpan {
  node: Text
  /** Offset of this node's first char within the concatenated haystack. */
  start: number
}

function collectText(container: HTMLElement): { text: string; spans: NodeSpan[] } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const spans: NodeSpan[] = []
  let text = ''
  let n: Node | null
  while ((n = walker.nextNode())) {
    const node = n as Text
    spans.push({ node, start: text.length })
    text += node.data
  }
  return { text, spans }
}

/** Escape a string for literal use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a whitespace-tolerant pattern: every run of whitespace in the
 * needle matches any run of whitespace in the haystack.
 */
function flexiblePattern(needle: string): RegExp {
  const collapsed = needle.trim().replace(/\s+/g, ' ')
  const parts = collapsed.split(' ').map(escapeRe)
  return new RegExp(parts.join('\\s+'), 'i')
}

/**
 * Wrap the character range [from, to) of the haystack — described by
 * `spans` — in <mark> elements (one per overlapped text node).
 * Returns the first mark created, for scroll-into-view.
 */
function wrapRange(spans: NodeSpan[], from: number, to: number): HTMLElement | null {
  let first: HTMLElement | null = null
  for (const span of spans) {
    const nodeStart = span.start
    const nodeEnd = span.start + span.node.data.length
    if (nodeEnd <= from || nodeStart >= to) continue
    const localFrom = Math.max(0, from - nodeStart)
    const localTo = Math.min(span.node.data.length, to - nodeStart)
    if (localTo <= localFrom) continue

    // Split the text node so the matched slice is isolated, then wrap it.
    let target = span.node
    if (localFrom > 0) target = target.splitText(localFrom)
    if (localTo - localFrom < target.data.length) target.splitText(localTo - localFrom)

    const mark = document.createElement('mark')
    mark.className = MARK_CLASS
    target.parentNode?.insertBefore(mark, target)
    mark.appendChild(target)
    if (!first) first = mark
  }
  return first
}

/**
 * Highlight `quote` inside `container`. Returns the first mark element,
 * or null when no match is found. Falls back to a shortened prefix of
 * the quote when the full passage cannot be located verbatim.
 */
export function highlightQuote(container: HTMLElement, quote: string): HTMLElement | null {
  const needle = (quote ?? '').trim()
  if (needle.length < 3) return null

  const attempt = (q: string): HTMLElement | null => {
    const { text, spans } = collectText(container)
    const m = flexiblePattern(q).exec(text)
    if (!m) return null
    return wrapRange(spans, m.index, m.index + m[0].length)
  }

  let first = attempt(needle)
  if (!first && needle.length > 80) {
    // The model's quote may be paraphrased at the tail — try a prefix.
    first = attempt(needle.slice(0, 80))
  }
  return first
}

/**
 * Highlight a citation quote that may span a page break. The backend
 * marks the break with a sentinel; each side is highlighted separately.
 * Returns the first mark for scroll-into-view.
 */
export function highlightCitation(
  container: HTMLElement,
  quote: string,
  pageBreakSentinel: string,
): HTMLElement | null {
  clearHighlights(container)
  const segments = quote.split(pageBreakSentinel).map((s) => s.trim()).filter(Boolean)
  let first: HTMLElement | null = null
  for (const seg of segments) {
    const m = highlightQuote(container, seg)
    if (m && !first) first = m
  }
  return first
}
