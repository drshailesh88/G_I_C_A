/**
 * Template Utility Functions (Pure — no DB dependency)
 *
 * Variable interpolation and validation logic.
 */

/**
 * Replace {{variableName}} placeholders in content string.
 * Nested access via dot notation: {{person.fullName}}
 */
export function interpolate(
  content: string,
  variables: Record<string, unknown>,
): string {
  return content.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const value = resolvePath(variables, path);
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

export function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    // Guard against prototype chain access (e.g., __proto__, constructor)
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Validate that all required variables are present.
 * Returns list of missing variable names, or empty array if all present.
 */
export function validateRequiredVariables(
  requiredVariables: string[],
  provided: Record<string, unknown>,
): string[] {
  return requiredVariables.filter((v) => {
    const value = resolvePath(provided, v);
    return value === undefined || value === null;
  });
}
