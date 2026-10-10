
import { replaceAllRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
  const apply = (from: string, to: string) => { source = replaceAllRequired(source, from, to); };

    apply('rankedClasses, pythonFileInfoList, goFileInfoList);', 'rankedClasses, pythonFileInfoList, goFileInfoList, repoPath);')

  return source;
};

export {};
