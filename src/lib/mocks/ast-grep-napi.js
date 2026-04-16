/**
 * Mock for @ast-grep/napi to prevent build-time native module errors on Cloudflare.
 */
module.exports = {
  SgNode: function() {},
  parse: function() { return { root: function() {} }; },
  // Add other required exports as found in the trace
};
