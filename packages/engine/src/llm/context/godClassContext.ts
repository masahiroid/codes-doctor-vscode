import { GodClassResult } from '../../types';

const TOP_GOD_CLASS_LIST_SIZE = 8;

export interface GodClassContext {
  total: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  top: Array<{
    className: string;
    filePath: string;
    methodCount: number;
    lineCount: number;
    godScore: number;
    rank: string;
  }>;
}

export function buildGodClassContext(godClassList: GodClassResult[]): GodClassContext {
  return {
    total: godClassList.length,
    criticalCount: godClassList.filter((g) => g.rank === 'critical').length,
    highCount: godClassList.filter((g) => g.rank === 'high').length,
    mediumCount: godClassList.filter((g) => g.rank === 'medium').length,
    top: [...godClassList]
      .sort((a, b) => b.godScore - a.godScore)
      .slice(0, TOP_GOD_CLASS_LIST_SIZE)
      .map((g) => ({
        className: g.className,
        filePath: g.filePath,
        methodCount: g.methodCount,
        lineCount: g.lineCount,
        godScore: Number(g.godScore.toFixed(1)),
        rank: g.rank,
      })),
  };
}
