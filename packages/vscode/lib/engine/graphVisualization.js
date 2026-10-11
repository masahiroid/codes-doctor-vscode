"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const browserLibraries_1 = require("./browserLibraries");
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    source = (0, sourceReplacement_1.replaceRequired)(source, "  const width = document.getElementById('d3-graph').clientWidth;", `  const container = document.getElementById('d3-graph');
  if (typeof d3 === 'undefined') {
    container.textContent = 'グラフ描画ライブラリを読み込めませんでした。ネットワーク接続を確認してレポートを開き直してください。';
    return;
  }
  let resizeGraph;
  function renderGraph(width) {`);
    source = (0, sourceReplacement_1.replaceRequired)(source, "  const g = svg.append('g');", `  resizeGraph = function(nextWidth) {
    svg.attr('width', nextWidth).attr('viewBox', [0, 0, nextWidth, height]);
    simulation.force('center', d3.forceCenter(nextWidth / 2, height / 2));
    simulation.alpha(0.3).restart();
  };
  const g = svg.append('g');`);
    source = (0, sourceReplacement_1.replaceRequired)(source, '})();', `  }
  const resize = function() {
    const width = container.clientWidth;
    if (width <= 0) return;
    if (resizeGraph) resizeGraph(width);
    else renderGraph(width);
  };
  new ResizeObserver(resize).observe(container);
  resize();
})();`);
    source = (0, sourceReplacement_1.replaceRequired)(source, '<script src="https://d3js.org/d3.v7.min.js"></script>', '${' + JSON.stringify(browserLibraries_1.reportLibraryScripts.d3) + '}');
    return source;
};
