import { reportLibraryScripts } from './browserLibraries';
import { replaceRequired } from './sourceReplacement';

/** Embed the bundled D3 instead of loading it from the CDN. */
module.exports = function patch(source: string) {
  return replaceRequired(source, '<script src="https://d3js.org/d3.v7.min.js"></script>', '${' + JSON.stringify(reportLibraryScripts.d3) + '}');
};

export {};
