"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    source = (0, sourceReplacement_1.replaceRequired)(source, '<div class="box">\${(0, d3Graph_1.generateD3VisualizationScript)(graph)}</div>', '<div class="box">\${graph.links.length === 0 ? \'<p>クラスは検出されましたが、クラス間の内部依存は検出されませんでした。ノードのみ表示します。</p>\' : \'\'}\${(0, d3Graph_1.generateD3VisualizationScript)(graph)}</div>');
    return source;
};
