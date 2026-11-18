/**
 * HTML tables → rows of text (pure, no I/O), and rows → CSV.
 *
 * Data tables only: layout tables (`role="presentation"`, tables that wrap
 * other tables, single-cell tables) are skipped. `colspan` and `rowspan` are
 * expanded so every row has one value per column. Everything is bounded:
 * tables, rows, columns and cell length.
 */
import { load, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

export const TABLE_LIMITS = {
  maxTables: 20,
  maxRows: 1000,
  maxColumns: 50,
  maxCellLength: 2000,
} as const;

export interface ExtractedTable {
  /** Position among the data tables of the page, from 0. */
  readonly index: number;
  readonly caption: string | null;
  /** Column names (from `<thead>` or a first row of `<th>`); empty when the table has none. */
  readonly headers: readonly string[];
  /** Body rows; each has `columnCount` values. */
  readonly rows: readonly (readonly string[])[];
  readonly rowCount: number;
  readonly columnCount: number;
  /** True when rows or columns were dropped by a cap. */
  readonly truncated: boolean;
}

export interface PageTables {
  /** Data tables found on the page, before the cap on their number. */
  readonly total: number;
  readonly tables: readonly ExtractedTable[];
  /** True when a cap (tables, rows, columns) cut the result. */
  readonly truncated: boolean;
}

const cellText = ($: CheerioAPI, cell: Element): string => {
  const clone = $(cell).clone();
  clone.find('script, style, noscript, template').remove();
  clone.find('br').replaceWith(' ');
  return clone.text().replace(/\s+/g, ' ').trim().slice(0, TABLE_LIMITS.maxCellLength);
};

const span = (value: string | undefined, max: number): number => {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 1 ? Math.min(parsed, max) : 1;
};

/** Expands the rows of a table into a rectangular grid, honouring spans. */
function toGrid($: CheerioAPI, rows: readonly Element[]): { grid: string[][]; headerRows: number; truncated: boolean } {
  const grid: string[][] = [];
  let truncated = rows.length > TABLE_LIMITS.maxRows;
  let headerRows = 0;
  let stillHeader = true;
  rows.slice(0, TABLE_LIMITS.maxRows).forEach((row, y) => {
    const cells = $(row).children('th, td').toArray();
    const line = (grid[y] ??= []);
    let x = 0;
    for (const cell of cells) {
      while (line[x] !== undefined) x += 1; // Taken by a rowspan from above.
      if (x >= TABLE_LIMITS.maxColumns) {
        truncated = true;
        break;
      }
      const value = cellText($, cell);
      const columns = span($(cell).attr('colspan'), TABLE_LIMITS.maxColumns - x);
      const lines = span($(cell).attr('rowspan'), TABLE_LIMITS.maxRows - y);
      for (let dy = 0; dy < lines; dy += 1) {
        const target = (grid[y + dy] ??= []);
        for (let dx = 0; dx < columns; dx += 1) target[x + dx] = value;
      }
      x += columns;
    }
    // Leading rows made only of <th>, or inside <thead>, name the columns.
    const isHeader =
      cells.length > 0 &&
      ($(row).parent('thead').length > 0 || cells.every((cell) => cell.tagName.toLowerCase() === 'th'));
    if (stillHeader && isHeader) headerRows = y + 1;
    else stillHeader = false;
  });
  const width = Math.min(TABLE_LIMITS.maxColumns, Math.max(0, ...grid.map((line) => line.length)));
  return {
    grid: grid.slice(0, TABLE_LIMITS.maxRows).map((line) => Array.from({ length: width }, (_, x) => line[x] ?? '')),
    headerRows,
    truncated,
  };
}

/**
 * Extracts the data tables of a document.
 *
 * @param selector - Optional CSS selector (already validated) restricting which tables are read.
 */
export function extractTables(html: string, selector: string | null = null): PageTables {
  const $ = load(html);
  let candidates: Element[];
  try {
    candidates = $(selector ?? 'table')
      .toArray()
      .filter((node): node is Element => node.type === 'tag' && node.name.toLowerCase() === 'table');
  } catch {
    candidates = [];
  }
  const tables: ExtractedTable[] = [];
  let total = 0;
  let truncated = false;
  for (const table of candidates) {
    const role = ($(table).attr('role') ?? '').toLowerCase();
    if (role === 'presentation' || role === 'none' || $(table).find('table').length > 0) continue;
    // Rows of this table only, in document order (thead, tbody, tfoot or direct children).
    const rows = $(table).find('tr').toArray().filter((row) => $(row).closest('table').get(0) === table);
    const { grid, headerRows, truncated: cut } = toGrid($, rows);
    const columnCount = grid[0]?.length ?? 0;
    if (grid.length === 0 || columnCount === 0 || grid.length * columnCount < 2) continue;
    total += 1;
    if (tables.length >= TABLE_LIMITS.maxTables) {
      truncated = true;
      continue;
    }
    // Several header rows (grouped columns) are joined: "Price EU", "Price UK".
    const headers =
      headerRows === 0
        ? []
        : Array.from({ length: columnCount }, (_, x) =>
            [...new Set(grid.slice(0, headerRows).map((line) => line[x] ?? '').filter((value) => value !== ''))].join(' '),
          );
    const body = grid.slice(headerRows);
    truncated = truncated || cut;
    tables.push({
      index: tables.length,
      caption: $(table).children('caption').first().text().replace(/\s+/g, ' ').trim().slice(0, 500) || null,
      headers,
      rows: body,
      rowCount: body.length,
      columnCount,
      truncated: cut,
    });
  }
  return { total, tables, truncated };
}

/**
 * Serialises a table as CSV (RFC 4180: CRLF, quotes doubled).
 *
 * The cells come from a third-party page and CSV is routinely opened in a
 * spreadsheet, where a cell starting with `=`, `+`, `-` or `@` is a formula.
 * Such cells are prefixed with an apostrophe (plain negative numbers are left
 * alone), the mitigation spreadsheet vendors and OWASP recommend.
 */
export function tableToCsv(table: Pick<ExtractedTable, 'headers' | 'rows'>): string {
  const cell = (value: string): string => {
    const safe = /^[=+@\t\r]/.test(value) || (value.startsWith('-') && !/^-[\d\s.,]+%?$/.test(value)) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const lines = [...(table.headers.length > 0 ? [table.headers] : []), ...table.rows];
  return lines.map((line) => line.map(cell).join(',')).join('\r\n') + '\r\n';
}
