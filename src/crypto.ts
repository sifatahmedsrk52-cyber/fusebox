// AES-GCM encrypt/decrypt for the OpenAI admin keys subscribers hand us. The
// symmetric key lives only as the ENCRYPTION_KEY Worker secret (never in D1,
// never in git) - set it once with `wrangler secret put ENCRYPTION_KEY`
// using 32 random bytes, base64-encoded (see README for the exact command).

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = b64ToBytes(base64Key);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(
  plaintext: string,
  base64Key: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { ciphertext: bytesToB64(cipherBuf), iv: bytesToB64(iv) };
}

export async function decryptSecret(
  ciphertextB64: string,
  ivB64: string,
  base64Key: string,
): Promise<string> {
  const key = await importKey(base64Key);
  const cipherBuf = b64ToBytes(ciphertextB64);
  const iv = b64ToBytes(ivB64);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}
