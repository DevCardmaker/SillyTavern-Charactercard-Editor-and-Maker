/** UTF-8-safe base64 helpers. PNG tEXt payloads are Latin-1/ASCII, but the JSON they carry may
 * contain full Unicode (character names, emoji, ...), so we go through UTF-8 bytes explicitly
 * rather than relying on btoa/atob's native Latin-1 string handling. */

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
