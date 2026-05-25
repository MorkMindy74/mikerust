<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!--
  Spreadsheet renderer.

  v0.5.x — swapped from SheetJS (`xlsx`, removed from npm registry,
  carrying 2 high-severity CVEs since 2023: Prototype Pollution
  GHSA-4r6h-8v6p-xvw6 and ReDoS GHSA-5pgg-2g8v-p4x9) to **ExcelJS**
  (`exceljs`, AGPL-compatible MIT, actively maintained on the npm
  registry).

  Coverage trade-off — ExcelJS only handles the Open XML `.xlsx`
  format:
    - `.xlsx` → full in-app preview with sheet tabs, citation
       highlighting (this file).
    - `.csv`  → inline parse + render (zero dependency).
    - `.xls`, `.xlsb`, `.ods` → graceful "open externally" fallback.
      Backend text extraction (via `calamine` in Rust) is unaffected,
      so the assistant can still answer questions about those files —
      only the visual preview is missing.

  Magic-bytes detection (first 4 bytes) routes between the three
  paths without needing the filename to be passed down. CSV is
  detected by the absence of any binary signature plus presence of a
  reasonable separator on the first non-empty line.
-->
<script lang="ts">
  import ExcelJS from 'exceljs'
  import DOMPurify from 'dompurify'
  import { highlightCitation } from '$lib/utils/highlight'
  import { PAGE_BREAK_SENTINEL } from '$lib/types/citation'
  import Spinner from '$lib/components/ui/Spinner.svelte'
  import { i18n } from '$lib/stores/i18n.svelte'

  interface Props {
    bytes: Uint8Array
    quote?: string
    revision?: number
  }

  let { bytes, quote, revision = 0 }: Props = $props()

  type Format = 'xlsx' | 'csv' | 'legacy'

  interface SheetData {
    name: string
    /** Rows × cols of plain strings, already coerced from Excel
     *  numbers / dates / formula results. Rendered as a basic
     *  HTML table by `sheetToHtml`. */
    rows: string[][]
  }

  let loading = $state(true)
  let err = $state<string | null>(null)
  let format = $state<Format>('xlsx')
  let sheets = $state<SheetData[]>([])
  let activeSheet = $state(0)
  let host: HTMLDivElement

  function detectFormat(b: Uint8Array): Format {
    if (b.length < 4) return 'csv'
    // PK\x03\x04 — ZIP (Open XML .xlsx or OpenDocument .ods)
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
      // Distinguish .ods from .xlsx is non-trivial without unzipping;
      // we try the XLSX parse first and fall back to legacy on error.
      return 'xlsx'
    }
    // D0 CF 11 E0 — Compound Document (.xls, .xlsb)
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
      return 'legacy'
    }
    // Plain text — assume CSV / TSV.
    return 'csv'
  }

  function parseCsv(text: string): SheetData[] {
    // Minimal RFC-4180-ish CSV parser. Doesn't try to be a champion;
    // the doc viewer is preview-only, the backend `calamine` path is
    // the authoritative extraction for citations.
    const sep = text.includes('\t') && !text.includes(',') ? '\t' : ','
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          cell += ch
        }
      } else if (ch === '"' && cell === '') {
        inQuotes = true
      } else if (ch === sep) {
        row.push(cell)
        cell = ''
      } else if (ch === '\r') {
        // skip — \r\n handled by the \n branch
      } else if (ch === '\n') {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      } else {
        cell += ch
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell)
      rows.push(row)
    }
    return [{ name: 'CSV', rows }]
  }

  /** Convert an ExcelJS Cell value to a plain string for table
   *  display. ExcelJS surfaces formulas as objects `{ formula, result }`,
   *  dates as JS Date instances, rich text as objects `{ richText: [...] }`. */
  function cellToString(v: unknown): string {
    if (v == null) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (v instanceof Date) {
      // ISO without time when the time is exactly midnight.
      const iso = v.toISOString()
      return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
    }
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>
      // Formula cell: prefer the cached result if present.
      if ('result' in obj && obj.result != null) return cellToString(obj.result)
      // Hyperlink cell: { text, hyperlink }.
      if ('text' in obj && typeof obj.text === 'string') return obj.text
      // Rich text: array of { text, font? } chunks.
      if ('richText' in obj && Array.isArray(obj.richText)) {
        return (obj.richText as Array<{ text?: string }>)
          .map((p) => p.text ?? '')
          .join('')
      }
      // Error cell: { error: '#REF!' }.
      if ('error' in obj && typeof obj.error === 'string') return obj.error
    }
    return ''
  }

  async function parseXlsx(b: Uint8Array): Promise<SheetData[]> {
    const wb = new ExcelJS.Workbook()
    // ExcelJS expects a Buffer or ArrayBuffer. We slice to get a
    // standalone ArrayBuffer (Uint8Array.buffer may be a shared
    // SharedArrayBuffer view from an upstream loader).
    const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
    await wb.xlsx.load(buf)
    const out: SheetData[] = []
    wb.eachSheet((ws) => {
      const rows: string[][] = []
      // ws.rowCount / columnCount are sometimes wider than the actual
      // data (Excel allocates empty trailing rows). We iterate via
      // eachRow which yields only populated rows.
      let maxCols = 0
      const acc: Array<{ rowNum: number; cells: string[] }> = []
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        const cells: string[] = []
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          while (cells.length < colNum - 1) cells.push('')
          cells.push(cellToString(cell.value))
        })
        if (cells.length > maxCols) maxCols = cells.length
        acc.push({ rowNum, cells })
      })
      // Normalise row widths to the widest row so the rendered table
      // doesn't have ragged trailing columns.
      for (const { cells } of acc) {
        while (cells.length < maxCols) cells.push('')
        rows.push(cells)
      }
      out.push({ name: ws.name, rows })
    })
    return out
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function sheetToHtml(sheet: SheetData): string {
    if (sheet.rows.length === 0) {
      return '<p class="sheet-empty">— empty —</p>'
    }
    const rowsHtml = sheet.rows
      .map(
        (r) =>
          `<tr>${r
            .map((c) => `<td>${escapeHtml(c)}</td>`)
            .join('')}</tr>`,
      )
      .join('')
    return `<table id="sheet">${rowsHtml}</table>`
  }

  function renderSheet() {
    if (!host || format === 'legacy') return
    const sheet = sheets[activeSheet]
    if (!sheet) return
    host.innerHTML = DOMPurify.sanitize(sheetToHtml(sheet))
    if (quote) {
      const mark = highlightCitation(host, quote, PAGE_BREAK_SENTINEL)
      if (mark) {
        mark.classList.add('doc-hl-flash')
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }

  // load() ONLY parses + stamps the local state. It must NOT call
  // renderSheet directly: renderSheet reads `sheets`, `activeSheet`,
  // and `quote`, which would become tracked deps of the outer $effect
  // that calls load(), and load() then writes back to `sheets` /
  // `activeSheet` in the same run → Svelte 5 detects the
  // read-then-write loop and bails with effect_update_depth_exceeded.
  // The dedicated render $effect below picks up the new workbook on
  // the `loading: true → false` transition.
  async function load() {
    loading = true
    err = null
    sheets = []
    activeSheet = 0
    try {
      const detected = detectFormat(bytes)
      if (detected === 'legacy') {
        format = 'legacy'
        return
      }
      if (detected === 'csv') {
        format = 'csv'
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
        sheets = parseCsv(text)
        return
      }
      // XLSX path — ExcelJS may still throw on .ods (also ZIP) or on
      // a corrupted workbook; surface the error and let the user open
      // externally.
      try {
        format = 'xlsx'
        sheets = await parseXlsx(bytes)
      } catch (e) {
        // .ods reaches this branch (ZIP magic but XLSX parser fails);
        // fall back to the legacy display.
        format = 'legacy'
        const msg = (e as Error).message ?? String(e)
        // Surface the cause for the diagnostic pane.
        err = msg
      }
    } catch (e) {
      err = (e as Error).message
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void bytes
    void load()
  })

  $effect(() => {
    // Render-only effect: fires whenever the user switches tab, a tab
    // is re-targeted (revision++), the highlight quote changes, OR
    // load() finishes (loading → false). Reads state, never writes —
    // no feedback with the load() effect above.
    void activeSheet
    void revision
    void quote
    if (!loading && format !== 'legacy' && !err) renderSheet()
  })
</script>

<div class="flex flex-col h-full min-h-0">
  {#if sheets.length > 1}
    <div
      class="flex gap-1 px-2 py-1.5 shrink-0 border-b border-(--color-surface-200) overflow-x-auto"
    >
      {#each sheets as sheet, i (sheet.name)}
        <button
          type="button"
          onclick={() => (activeSheet = i)}
          class="px-2.5 h-7 rounded-(--radius-md) text-xs whitespace-nowrap
                 {activeSheet === i
                   ? 'bg-(--color-active-bg) text-(--color-brand-700) font-medium'
                   : 'text-(--color-text-secondary) hover:bg-(--color-hover-bg)'}"
        >
          {sheet.name}
        </button>
      {/each}
    </div>
  {/if}

  <div class="flex-1 min-h-0 overflow-auto bg-(--color-surface-50) p-3">
    {#if loading}
      <div
        class="flex items-center justify-center gap-2 py-12 text-sm text-(--color-text-secondary)"
      >
        <Spinner size="sm" />
        {i18n.t('Documents.viewer.loadingDocument')}
      </div>
    {:else if format === 'legacy'}
      <div
        class="max-w-md mx-auto py-12 text-center text-sm text-(--color-text-secondary)"
      >
        <p class="font-medium text-(--color-text-primary) mb-2">
          {i18n.t('SheetView.legacyFormatTitle')}
        </p>
        <p>{i18n.t('SheetView.legacyFormatBody')}</p>
      </div>
    {:else if err}
      <p class="text-sm text-(--color-danger-500) py-12 text-center">
        {i18n.t('Documents.viewer.errorLoading')} — {err}
      </p>
    {/if}
    <div bind:this={host} class="sheet-body"></div>
  </div>
</div>

<style>
  .sheet-body :global(table#sheet) {
    border-collapse: collapse;
    font-size: 12px;
  }
  .sheet-body :global(table#sheet td) {
    border: 1px solid var(--color-surface-200);
    padding: 4px 8px;
    vertical-align: top;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
