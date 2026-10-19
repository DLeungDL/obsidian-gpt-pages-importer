/** SHA-256 of exact UTF-8 bytes, including BOM and line endings. */
export async function digest(text: string): Promise<string> {
  return digestBytes(new TextEncoder().encode(text));
}
export async function digestBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await window.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
