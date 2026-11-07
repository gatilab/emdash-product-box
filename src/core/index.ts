/**
 * Framework-free core: field mapping, price helpers, cache precedence,
 * JSON-LD and the Creators API client. Safe to import anywhere.
 */
export * from "./types.js";
export * from "./fields.js";
export * from "./price.js";
export * from "./merge.js";
export * from "./schema.js";
export * from "./amazon.js";
export { descriptionHtml, escapeHtml, htmlToText, linkAttrs, relTokens, safeUrl, sanitizeHtml } from "./text.js";
export { icon } from "./icons.js";
