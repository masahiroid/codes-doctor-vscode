import ts from 'typescript';

/**
 * Source ranges a TS/JS security scan must not report: string and template literal
 * text, regular expression literals, comments, and `.exec` on a regex literal
 * (`/x/.exec(s)` is a regex match, not command execution). Offsets are preserved, so
 * a pattern match is skipped when its start falls inside one of these ranges.
 * Template `${…}` expressions are executable and stay scanned.
 */
export function securityIgnoredRanges(content: string): Array<[number, number]> {
  const file = ts.createSourceFile('security.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ranges: Array<[number, number]> = [];

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isRegularExpressionLiteral(node) || ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      ranges.push([node.getStart(file), node.end]);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'exec') {
      let receiver: ts.Expression = node.expression.expression;
      while (ts.isParenthesizedExpression(receiver)) receiver = receiver.expression;
      if (ts.isRegularExpressionLiteral(receiver)) ranges.push([node.expression.getStart(file), node.expression.end]);
    }
    ts.forEachChild(node, visit);
  }

  function comments(node: ts.Node): void {
    const commentRanges = [
      ...(ts.getLeadingCommentRanges(content, node.pos) || []),
      ...(ts.getTrailingCommentRanges(content, node.end) || []),
    ];
    for (const range of commentRanges) ranges.push([range.pos, range.end]);
    ts.forEachChild(node, comments);
  }

  visit(file);
  comments(file);
  return ranges;
}
