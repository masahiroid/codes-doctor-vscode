import type { SimpleFileInfo } from '../../../types';
import { renderOutline } from './structureOutline';

/** Structure of a lightweight-parsed file, built from the parse result the analysis already used. */
export function buildLightweightStructure(file: SimpleFileInfo, typeHeading: string): string {
  return renderOutline([
    { kind: 'names', heading: 'インポート', items: file.imports },
    {
      kind: 'types',
      heading: typeHeading,
      types: file.classes.map((cls) => ({
        name: cls.name,
        counts: [{ label: 'プロパティ', value: cls.propertyCount }],
        methods: cls.methods,
      })),
    },
    { kind: 'names', heading: '関数', items: file.functions.map((fn) => fn.name), suffix: '()' },
  ]);
}
