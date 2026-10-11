export function replaceRequired(source: string, from: string, to: string) {
  if (!source.includes(from)) throw new Error(`Engine patch marker missing: ${from}`);
  return source.replace(from, () => to);
}

module.exports = { replaceRequired };

export function replaceAllRequired(source: string, from: string, to: string) {
  if (!source.includes(from)) throw new Error(`Dependency patch marker missing: ${from}`);
  return source.replaceAll(from, () => to);
}
module.exports.replaceAllRequired = replaceAllRequired;
