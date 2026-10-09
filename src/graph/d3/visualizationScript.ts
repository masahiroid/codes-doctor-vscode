import { D3Graph, D3_GRAPH_GROUPS } from './buildDependencyGraph';

const GRAPH_HEIGHT_PX = 600;
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
  const graphData = ${JSON.stringify(graph)};
  const groups = ${JSON.stringify(D3_GRAPH_GROUPS)};

  const width = document.getElementById('d3-graph').clientWidth;
  const height = ${GRAPH_HEIGHT_PX};

  const colorScale = d3.scaleOrdinal()
    .domain(groups)
    .range(${JSON.stringify(GROUP_COLORS)});

  const svg = d3.select('#d3-graph')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height]);

  const g = svg.append('g');

  svg.call(d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    }));

  const simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.links)
      .id(d => d.id)
      .distance(100)
      .strength(0.5))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => Math.sqrt(d.size) + 5));

  svg.append('defs').selectAll('marker')
    .data(['arrow'])
    .enter().append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
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
    if (!event.active) simulation.alphaTarget(0.3).restart();
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
    .attr('transform', \`translate(\${width - 150}, 20)\`);

  legend.selectAll('rect')
    .data(groups)
    .enter().append('rect')
    .attr('x', 0)
    .attr('y', (d, i) => i * 20)
    .attr('width', 15)
    .attr('height', 15)
    .attr('fill', d => colorScale(d))
    .attr('stroke', '#ccc');

  legend.selectAll('text')
    .data(groups)
    .enter().append('text')
    .attr('x', 20)
    .attr('y', (d, i) => i * 20 + 12)
    .text(d => d)
    .attr('font-size', 12);
})();
</script>
`;
}
