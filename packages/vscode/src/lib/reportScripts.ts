/**
 * Report browser scripts and libraries, owned by the engine. The extension reuses them
 * to upgrade reports saved by older versions when they are reopened.
 */
type ReviewCopyModule = typeof import('../../vendor/csap/report/browser/reviewCopy');
type ReportTabsModule = typeof import('../../vendor/csap/report/browser/reportTabs');
type LibrariesModule = typeof import('../../vendor/csap/report/browser/libraries');

/* eslint-disable global-require */
const reviewCopy: ReviewCopyModule = require('../vendor/csap/report/browser/reviewCopy');
const reportTabs: ReportTabsModule = require('../vendor/csap/report/browser/reportTabs');
const libraries: LibrariesModule = require('../vendor/csap/report/browser/libraries');
/* eslint-enable global-require */

export const { injectReviewCopy, isReviewTargetId } = reviewCopy;
export const { injectReportTabs } = reportTabs;
export const { reportLibraryScript } = libraries;
export type ReportLibrary = import('../../vendor/csap/report/browser/libraries').ReportLibrary;
