/**
 * Zero-Knowledge Client-Side AES-256-GCM Encryption Vault (WebCrypto API)
 * Used to encrypt sensitive patient records in the browser prior to optional Firestore persistence.
 */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(passphrase: string, saltString: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`healthbridge-vault-v1:${saltString}`),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPatientPayload(
  plainJsonString: string,
  passphrase: string,
  ownerUid: string
): Promise<{ cipherText: string; iv: string; algorithm: 'AES-256-GCM' }> {
  const key = await deriveAesGcmKey(passphrase, ownerUid);
  const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(plainJsonString);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    encodedData
  );

  return {
    cipherText: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(ivBytes),
    algorithm: 'AES-256-GCM',
  };
}

export async function decryptPatientPayload(
  cipherTextBase64: string,
  ivBase64: string,
  passphrase: string,
  ownerUid: string
): Promise<string> {
  const key = await deriveAesGcmKey(passphrase, ownerUid);
  const ivBytes = base64ToBytes(ivBase64);
  const cipherBytes = base64ToBytes(cipherTextBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    cipherBytes
  );

  return new TextDecoder().decode(decryptedBuffer);
}
