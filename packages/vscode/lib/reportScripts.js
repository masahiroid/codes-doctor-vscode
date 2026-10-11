"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportLibraryScript = exports.injectReportTabs = exports.isReviewTargetId = exports.injectReviewCopy = void 0;
/* eslint-disable global-require */
const reviewCopy = require('../vendor/csap/report/browser/reviewCopy');
const reportTabs = require('../vendor/csap/report/browser/reportTabs');
const libraries = require('../vendor/csap/report/browser/libraries');
/* eslint-enable global-require */
({ injectReviewCopy: exports.injectReviewCopy, isReviewTargetId: exports.isReviewTargetId } = reviewCopy);
({ injectReportTabs: exports.injectReportTabs } = reportTabs);
({ reportLibraryScript: exports.reportLibraryScript } = libraries);
