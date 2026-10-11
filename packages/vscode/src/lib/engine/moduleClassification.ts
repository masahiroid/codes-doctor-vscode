
import { replaceAllRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
  const apply = (from: string, to: string) => { source = replaceAllRequired(source, from, to); };

    for (const field of ['fanIn', 'fanOut', 'instability']) apply(`m.${field} >= ${field}P90`, `m.${field} > 0 && m.${field} >= ${field}P90`);
    apply('metric.fanIn >= fanInP90', 'metric.fanIn > 0 && metric.fanIn >= fanInP90');
    apply('metric.fanOut >= fanOutP90 ||', '(metric.fanOut > 0 && metric.fanOut >= fanOutP90) ||');

  return source;
};

export {};
