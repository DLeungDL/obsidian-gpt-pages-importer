/** Git checkouts and license archives can use different line endings. */
export function canonicalText(text) { return text.replace(/\r\n?/g, '\n'); }
