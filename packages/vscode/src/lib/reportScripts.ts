import { loadEngine } from './engine';

/**
 * Report browser scripts and libraries, owned by the engine (identical in both language
 * builds). The extension reuses them to upgrade reports saved by older versions.
 */
const engine = loadEngine('ja');

export const { injectReviewCopy, isReviewTargetId, injectReportTabs, reportLibraryScript } = engine;
export type ReportLibrary = import('../../vendor/csap').ReportLibrary;
