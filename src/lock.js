// Device-local app lock: PIN (PBKDF2 hash) + optional biometric unlock via WebAuthn platform authenticator.
// This guards the UI on this device only; data in IndexedDB is not encrypted.
const KEY = 'finora.lock'
const ATTEMPTS_KEY = 'finora.lock.attempts'

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function hashPin(pin, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, base, 256))
}

export function getLockConfig() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
const save = (cfg) => localStorage.setItem(KEY, JSON.stringify(cfg))

export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prev = getLockConfig() || {}
  save({ ...prev, salt: b64(salt), hash: await hashPin(pin, salt), pinLength: pin.length })
  clearAttempts()
}

export async function verifyPin(pin) {
  const cfg = getLockConfig()
  if (!cfg?.hash) return false
  return (await hashPin(pin, unb64(cfg.salt))) === cfg.hash
}

export function removeLock() { localStorage.removeItem(KEY); clearAttempts() }


// Failed-PIN counter lives in localStorage so reloading the page does not reset the lockout.
export function getAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || 'null') || { fails: 0, until: 0 } } catch { return { fails: 0, until: 0 } }
}
export function recordFailure() {
  const fails = getAttempts().fails + 1
  const until = fails >= 5 ? Date.now() + Math.min(300, 15 * 2 ** (fails - 5)) * 1000 : 0
  try { localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ fails, until })) } catch {}
  return { fails, until }
}
export function clearAttempts() { try { localStorage.removeItem(ATTEMPTS_KEY) } catch {} }

export async function biometricsSupported() {
  try {
    return !!(window.PublicKeyCredential && window.isSecureContext &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch { return false }
}

export async function enableBiometrics() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Finora' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'finora-user', displayName: 'Finora' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000
  } })
  const pub = cred.response.getPublicKey?.()
  const alg = cred.response.getPublicKeyAlgorithm?.()
  if (!pub || ![-7, -257].includes(alg)) throw new Error('Public key unavailable')
  save({ ...getLockConfig(), credId: b64(cred.rawId), pubKey: b64(pub), alg })
}

export function disableBiometrics() {
  const { credId, pubKey, alg, ...rest } = getLockConfig() || {}
  save(rest)
}

// ECDSA signatures in WebAuthn are DER encoded; WebCrypto expects raw r||s.
export function derToRaw(der, size = 32) {
  const bytes = new Uint8Array(der)
  let i = 2
  if (bytes[0] !== 0x30) throw new Error('Bad signature')
  if (bytes[1] & 0x80) i += bytes[1] & 0x7f
  const read = () => {
    if (bytes[i++] !== 0x02) throw new Error('Bad signature')
    let len = bytes[i++]
    let part = bytes.slice(i, i + len)
    i += len
    while (part.length > size && part[0] === 0) part = part.slice(1)
    const out = new Uint8Array(size)
    out.set(part, size - part.length)
    return out
  }
  const r = read(), s = read()
  const raw = new Uint8Array(size * 2)
  raw.set(r, 0); raw.set(s, size)
  return raw
}

// Checks a WebAuthn assertion against the public key stored at enrolment.
export async function verifyAssertion({ pubKey, alg, challenge, authenticatorData, clientDataJSON, signature }) {
  const clientData = JSON.parse(new TextDecoder().decode(clientDataJSON))
  if (clientData.type !== 'webauthn.get' || clientData.challenge !== b64url(challenge)) return false
  const authData = new Uint8Array(authenticatorData)
  if (authData.length < 37 || !(authData[32] & 0x04)) return false // user verification flag
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON))
  const signed = new Uint8Array(authData.length + hash.length)
  signed.set(authData, 0); signed.set(hash, authData.length)
  const spki = unb64(pubKey)
  if (alg === -7) {
    const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(signature), signed)
  }
  if (alg === -257) {
    const key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed)
  }
  return false
}

export async function verifyBiometrics() {
  const cfg = getLockConfig()
  if (!cfg?.credId || !cfg?.pubKey) return false // older enrolments lack a public key: re-enable fingerprint
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const res = await navigator.credentials.get({ publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: unb64(cfg.credId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000
    } })
    if (!res) return false
    const { authenticatorData, clientDataJSON, signature } = res.response
    return await verifyAssertion({ pubKey: cfg.pubKey, alg: cfg.alg, challenge, authenticatorData, clientDataJSON, signature })
  } catch { return false }
}
