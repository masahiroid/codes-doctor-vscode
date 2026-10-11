import { D3Graph, D3_GRAPH_GROUPS } from './buildDependencyGraph';
import { scriptJson } from '../../html';

const GRAPH_HEIGHT_PX = 600;
/** Force-layout and legend tuning for the in-browser graph (embedded into the script as `layout`). */
const D3_LAYOUT = {
  zoomExtent: [0.1, 4],
  linkDistance: 100,
  linkStrength: 0.5,
  chargeStrength: -300,
  collisionPadding: 5,
  arrowOffset: 20,
  dragAlphaTarget: 0.3,
  resizeAlpha: 0.3,
  legendWidth: 150,
  legendTop: 20,
  legendRowHeight: 20,
  legendSwatchSize: 15,
  legendTextOffset: 20,
  legendTextBaseline: 12,
};
const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280'];

/**
 * Generate the D3.js visualization markup (container + inline script) for a
 * dependency graph. The script is a self-contained IIFE; graph data is
 * embedded as JSON.
 */
export function generateD3VisualizationScript(graph: D3Graph): string {
  return `
<div id="d3-graph" style="width: 100%; height: ${GRAPH_HEIGHT_PX}px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa;"></div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
(function() {
  const graphData = ${scriptJson(graph)};
  const groups = ${JSON.stringify(D3_GRAPH_GROUPS)};
  const layout = ${JSON.stringify(D3_LAYOUT)};

  const container = document.getElementById('d3-graph');
  if (typeof d3 === 'undefined') {
    container.textContent = 'グラフ描画ライブラリを読み込めませんでした。ネットワーク接続を確認してレポートを開き直してください。';
    return;
  }
  // A graph in a hidden tab has zero width; render once it becomes visible and follow resizes.
  let resizeGraph;
  function renderGraph(width) {
  const height = ${GRAPH_HEIGHT_PX};

  const colorScale = d3.scaleOrdinal()
    .domain(groups)
    .range(${JSON.stringify(GROUP_COLORS)});

  const svg = d3.select('#d3-graph')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height]);

  resizeGraph = function(nextWidth) {
    svg.attr('width', nextWidth).attr('viewBox', [0, 0, nextWidth, height]);
    simulation.force('center', d3.forceCenter(nextWidth / 2, height / 2));
    simulation.alpha(layout.resizeAlpha).restart();
  };
  const g = svg.append('g');

  svg.call(d3.zoom()
    .scaleExtent(layout.zoomExtent)
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    }));

  const simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.links)
      .id(d => d.id)
      .distance(layout.linkDistance)
      .strength(layout.linkStrength))
    .force('charge', d3.forceManyBody().strength(layout.chargeStrength))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => Math.sqrt(d.size) + layout.collisionPadding));

  svg.append('defs').selectAll('marker')
    .data(['arrow'])
    .enter().append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', layout.arrowOffset)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#999');

  const link = g.append('g')
    .selectAll('line')
    .data(graphData.links)
    .enter().append('line')
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', d => Math.sqrt(d.value))
    .attr('marker-end', 'url(#arrow)');

  const node = g.append('g')
    .selectAll('circle')
    .data(graphData.nodes)
    .enter().append('circle')
    .attr('r', d => Math.sqrt(d.size) * 0.5 + 5)
    .attr('fill', d => colorScale(d.group))
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  const label = g.append('g')
    .selectAll('text')
    .data(graphData.nodes)
    .enter().append('text')
    .text(d => d.name)
    .attr('font-size', 10)
    .attr('dx', 12)
    .attr('dy', 4)
    .style('pointer-events', 'none');

  node.append('title')
    .text(d => \`\${d.name}\\nGroup: \${d.group}\\nFile: \${d.filePath}\\nComplexity: \${Math.round(d.size)}\`);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    label
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(layout.dragAlphaTarget).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  const legend = svg.append('g')
    .attr('transform', \`translate(\${width - layout.legendWidth}, \${layout.legendTop})\`);

  legend.selectAll('rect')
    .data(groups)
    .enter().append('rect')
    .attr('x', 0)
    .attr('y', (d, i) => i * layout.legendRowHeight)
    .attr('width', layout.legendSwatchSize)
    .attr('height', layout.legendSwatchSize)
    .attr('fill', d => colorScale(d))
    .attr('stroke', '#ccc');

  legend.selectAll('text')
    .data(groups)
    .enter().append('text')
    .attr('x', layout.legendTextOffset)
    .attr('y', (d, i) => i * layout.legendRowHeight + layout.legendTextBaseline)
    .text(d => d)
    .attr('font-size', 12);
  }
  const resize = function() {
    const width = container.clientWidth;
    if (width <= 0) return;
    if (resizeGraph) resizeGraph(width);
    else renderGraph(width);
  };
  new ResizeObserver(resize).observe(container);
  resize();
})();
</script>
`;
}
