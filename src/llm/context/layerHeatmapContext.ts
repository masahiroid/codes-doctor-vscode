import { LayerHeatmap } from '../../types';

export interface LayerHeatmapContext {
  layers: Array<{
    name: string;
    fileCount: number;
    classCount: number;
    dependencies: string[];
  }>;
}

export function buildLayerHeatmapContext(
  layerHeatmap: LayerHeatmap | undefined
): LayerHeatmapContext | undefined {
  if (!layerHeatmap?.layers?.length) return undefined;

  return {
    layers: layerHeatmap.layers.map((l) => ({
      name: l.name,
      fileCount: l.fileCount,
      classCount: l.classCount,
      dependencies: l.dependencies,
    })),
  };
}
