"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtmlAttr = escapeHtmlAttr;
function escapeHtmlAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
