"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const apply = (from, to) => { source = (0, sourceReplacement_1.replaceAllRequired)(source, from, to); };
    for (const field of ['fanIn', 'fanOut', 'instability'])
        apply(`m.${field} >= ${field}P90`, `m.${field} > 0 && m.${field} >= ${field}P90`);
    apply('metric.fanIn >= fanInP90', 'metric.fanIn > 0 && metric.fanIn >= fanInP90');
    apply('metric.fanOut >= fanOutP90 ||', '(metric.fanOut > 0 && metric.fanOut >= fanOutP90) ||');
    return source;
};
