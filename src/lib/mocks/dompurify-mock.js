/**
 * Mock for isomorphic-dompurify to prevent build-time jsdom/native module errors.
 */
module.exports = {
  sanitize: (html) => html,
  default: {
    sanitize: (html) => html
  }
};
