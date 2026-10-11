// Compatibility composition point for path-specific engine strategies.
module.exports = {
  ...require('../reportCopy'),
  ...require('./markdown'),
  ...require('./astRendering'),
  ...require('./sourceReplacement'),
};
