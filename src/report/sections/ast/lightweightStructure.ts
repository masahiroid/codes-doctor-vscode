import type { SimpleFileInfo } from '../../../types';
import { AST_SECTION_LIMITS } from './limits';
import { renderOutline } from './structureOutline';

/** Structure of a lightweight-parsed file, built from the parse result the analysis already used. */
export function buildLightweightStructure(file: SimpleFileInfo, typeHeading: string): string {
  return renderOutline([
    { kind: 'names', heading: 'Imports', items: file.imports, limit: AST_SECTION_LIMITS.listItems },
    {
      kind: 'types',
      heading: typeHeading,
      limit: AST_SECTION_LIMITS.classes,
      types: file.classes.map((cls) => ({
        name: cls.name,
        counts: [{ label: 'properties', value: cls.propertyCount }],
        methods: cls.methods,
      })),
    },
    { kind: 'names', heading: 'Functions', items: file.functions.map((fn) => fn.name), limit: AST_SECTION_LIMITS.listItems, suffix: '()' },
  ]);
}
