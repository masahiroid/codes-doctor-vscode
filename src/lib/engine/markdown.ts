export function installJapaneseStrong(marked: Pick<typeof import('marked', { with: { 'resolution-mode': 'import' } }), 'use'>) {
  marked.use({ extensions: [{
    name: 'strong',
    level: 'inline',
    start(src: string) { return src.indexOf('**'); },
    tokenizer(this: import('marked', { with: { 'resolution-mode': 'import' } }).TokenizerThis, src: string) {
      const match = /^\*\*(?!\*)([^\n]+?)\*\*(?!\*)/.exec(src);
      if (!match || !/[\u3000-\u30ff\u3400-\u9fff]/.test(match[1]) ||
          /^\s|\s$/.test(match[1]) || /\\|\*\*/.test(match[1])) return;
      return { type: 'strong', raw: match[0], text: match[1],
        tokens: this.lexer.inlineTokens(match[1]) };
    },
  }] });
}

module.exports = { installJapaneseStrong };
