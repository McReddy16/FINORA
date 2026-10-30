// Password-based encryption for backup files: PBKDF2-SHA256 -> AES-256-GCM.
const ITERATIONS = 200000

const toB64 = (buf) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export const isEncryptedBackup = (obj) => !!obj && obj.app === 'Finora' && obj.encrypted === true

export async function encryptBackup(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, ITERATIONS)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)))
  return { app: 'Finora', encrypted: true, version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(cipher) }
}

export async function decryptBackup(file, password) {
  try {
    const key = await deriveKey(password, fromB64(file.salt), file.iterations || ITERATIONS)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(file.data))
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new Error('Wrong password or the backup file is damaged.')
  }
}
