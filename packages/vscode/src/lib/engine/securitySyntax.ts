/** Preserve offsets while excluding literal/example text and proven RegExp calls. */
export function securityIgnoredRanges(content: string): Array<[number, number]> {
  // Kept inside the function because it is serialized into the vendored engine.
  const ts: typeof import('typescript') = require('typescript');
  const file = ts.createSourceFile('security.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ranges: Array<[number, number]> = [];
  function visit(node: import('typescript').Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isRegularExpressionLiteral(node) || ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      ranges.push([node.getStart(file), node.end]);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'exec') {
      let receiver: import('typescript').Expression = node.expression.expression;
      while (ts.isParenthesizedExpression(receiver)) receiver = receiver.expression;
      if (ts.isRegularExpressionLiteral(receiver)) ranges.push([node.expression.getStart(file), node.expression.end]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  function comments(node: import('typescript').Node): void {
    for (const range of [...(ts.getLeadingCommentRanges(content, node.pos) || []),
      ...(ts.getTrailingCommentRanges(content, node.end) || [])]) ranges.push([range.pos, range.end]);
    ts.forEachChild(node, comments);
  }
  comments(file);
  return ranges;
}
