// Compatibility composition point for path-specific engine strategies.
module.exports = {
  ...require('../reportCopy'),
  ...require('./markdown'),
  ...require('./promptRules'),
  ...require('./astRendering'),
  ...require('./sourceReplacement'),
  ...require('./securityExplanation'),
};
