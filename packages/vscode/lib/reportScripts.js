"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportLibraryScript = exports.injectTableFilter = exports.injectReportTabs = exports.isReviewTargetId = exports.injectReviewCopy = void 0;
const engine_1 = require("./engine");
/**
 * Report browser scripts and libraries, owned by the engine (identical in both language
 * builds). The extension reuses them to upgrade reports saved by older versions.
 */
const engine = (0, engine_1.loadEngine)('ja');
({ injectReviewCopy: exports.injectReviewCopy, isReviewTargetId: exports.isReviewTargetId, injectReportTabs: exports.injectReportTabs, injectTableFilter: exports.injectTableFilter, reportLibraryScript: exports.reportLibraryScript } = engine);
