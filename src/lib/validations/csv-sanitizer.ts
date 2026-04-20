const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;

export function hasCsvFormulaPrefix(value: string): boolean {
  return CSV_FORMULA_PREFIXES.some((p) => value.startsWith(p));
}

export function checkCsvFormulaFields(
  fields: ReadonlyArray<readonly [fieldName: string, value: string | undefined | null]>,
): string | null {
  for (const [name, value] of fields) {
    if (value && hasCsvFormulaPrefix(value)) {
      return `Unsafe spreadsheet formula detected in field "${name}"`;
    }
  }
  return null;
}
