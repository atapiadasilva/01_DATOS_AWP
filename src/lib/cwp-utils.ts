/**
 * CWP column detection utilities.
 * Single source of truth — used by DataEditor, RelationalExplorer, EmbeddedView.
 */

export const CWP_COLUMN_NAMES = ['CWP', 'PACKAGE', 'PAQUETE'] as const;
export type CwpColumnName = (typeof CWP_COLUMN_NAMES)[number];

export const CWP_FILTER_KEYS = [
  'CWP', 'PACKAGE', 'PAQUETE', 'WBS', 'EDT', 'PLANO', 'DRAWING',
] as const;

/**
 * Returns the first column from `columns` that matches a known CWP identifier.
 * Comparison is case-insensitive and trims whitespace.
 */
export function detectCwpColumn(columns: string[]): string | undefined {
  return columns.find(c =>
    (CWP_COLUMN_NAMES as ReadonlyArray<string>).includes(c.toUpperCase().trim())
  );
}

/**
 * Returns sorted unique CWP values from a dataset.
 */
export function extractCwpValues(
  data: Record<string, any>[],
  cwpColumn: string
): string[] {
  return Array.from(
    new Set(data.map(r => String(r[cwpColumn] || '')).filter(Boolean))
  ).sort();
}
