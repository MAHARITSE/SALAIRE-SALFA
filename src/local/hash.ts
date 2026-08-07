// ==============================================================================
// CLIENT LOCAL : HACHAGE SHA-256 (Web Crypto) - SALFA TANAMBAO
// Remplace crypto.createHash de Node par crypto.subtle du navigateur.
// ==============================================================================

const SALT = "salfa_tanambao_2026_salt_";

export async function hashPassword(pwd: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + pwd);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
