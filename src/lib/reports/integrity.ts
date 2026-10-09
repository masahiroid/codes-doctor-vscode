/** Detect the known legacy corruption without modifying or discarding saved results. */
export function hasIncompleteAstMarkup(html: string): boolean {
  const pendingTemplates = html.match(/<template\s+data-ast-pending\s*>/gi)?.length ?? 0;
  const closingTemplates = html.match(/<\/template\s*>/gi)?.length ?? 0;
  return pendingTemplates > closingTemplates;
}
