"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installJapaneseStrong = installJapaneseStrong;
function installJapaneseStrong(marked) {
    marked.use({ extensions: [{
                name: 'strong',
                level: 'inline',
                start(src) { return src.indexOf('**'); },
                tokenizer(src) {
                    const match = /^\*\*(?!\*)([^\n]+?)\*\*(?!\*)/.exec(src);
                    if (!match || !/[\u3000-\u30ff\u3400-\u9fff]/.test(match[1]) ||
                        /^\s|\s$/.test(match[1]) || /\\|\*\*/.test(match[1]))
                        return;
                    return { type: 'strong', raw: match[0], text: match[1],
                        tokens: this.lexer.inlineTokens(match[1]) };
                },
            }] });
}
module.exports = { installJapaneseStrong };
