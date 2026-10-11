"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const browserLibraries_1 = require("./browserLibraries");
const sourceReplacement_1 = require("./sourceReplacement");
/** Embed the bundled D3 instead of loading it from the CDN. */
module.exports = function patch(source) {
    return (0, sourceReplacement_1.replaceRequired)(source, '<script src="https://d3js.org/d3.v7.min.js"></script>', '${' + JSON.stringify(browserLibraries_1.reportLibraryScripts.d3) + '}');
};
