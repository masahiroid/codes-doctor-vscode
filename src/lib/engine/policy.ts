// Extension-owned processing policies. Generated engine modules receive a copy.
const policy = Object.freeze({
  reviewRetry: Object.freeze({ tokenMultiplier: 2, minimumTokens: 16000 }),
  astDisplay: Object.freeze({ filesPerBatch: 20 }),
  securityCaps: Object.freeze({ critical: 59, high: 79, medium: 89, other: 99 }),
});

export = policy;
