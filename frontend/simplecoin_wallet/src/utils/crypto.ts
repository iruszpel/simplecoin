import { Transaction } from "@/components/Wallet";

const SALT = "supersóldfhsahfidoaghfia98263495";

export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );

  const publicKey = await window.crypto.subtle.exportKey(
    "raw",
    keyPair.publicKey
  );
  const privateKey = await window.crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  );

  return {
    publicKey: arrayBufferToBase64(publicKey),
    privateKey: arrayBufferToBase64(privateKey),
  };
}

export async function encryptPrivateKey(
  privateKey: string,
  password: string
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: 100000,
      hash: "SHA-512",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToArrayBuffer(privateKey)
  );

  return JSON.stringify({
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(encrypted),
  });
}

export async function decryptPrivateKey(
  encryptedData: string,
  password: string
): Promise<string> {
  const { iv, data } = JSON.parse(encryptedData);
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: 100000,
      hash: "SHA-512",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(iv) },
    key,
    base64ToArrayBuffer(data)
  );

  return arrayBufferToBase64(decrypted);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateWalletAddress(
  publicKeyBase64: string
): Promise<string> {
  const publicKeyArrayBuffer = base64ToArrayBuffer(publicKeyBase64);

  const hashBuffer = await window.crypto.subtle.digest(
    "SHA-256",
    publicKeyArrayBuffer
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const addressHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const walletAddress = "0x" + addressHex.slice(-40);

  return walletAddress;
}

async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  const privateKeyArrayBuffer = base64ToArrayBuffer(privateKeyBase64);
  const privateKey = await window.crypto.subtle.importKey(
    "pkcs8",
    privateKeyArrayBuffer,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"]
  );
  return privateKey;
}

async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const publicKeyArrayBuffer = base64ToArrayBuffer(publicKeyBase64);
  const publicKey = await window.crypto.subtle.importKey(
    "raw",
    publicKeyArrayBuffer,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"]
  );
  return publicKey;
}

export async function signTransaction(
  transaction: Transaction,
  privateKeyBase64: string
): Promise<string> {
  const privateKey = await importPrivateKey(privateKeyBase64);

  const data =
    transaction.id +
    transaction.timestamp +
    transaction.fromAddress +
    transaction.toAddress +
    transaction.nonce +
    transaction.amount;

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const signatureBuffer = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    privateKey,
    dataBuffer
  );

  const signatureBase64 = arrayBufferToBase64(signatureBuffer);

  return signatureBase64;
}

export async function verifySignature(
  transaction: Transaction,
  signatureBase64: string
): Promise<boolean> {
  const publicKey = await importPublicKey(transaction.publicKey);

  const data =
    transaction.id +
    transaction.timestamp +
    transaction.fromAddress +
    transaction.toAddress +
    transaction.nonce +
    transaction.amount;

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const signatureBuffer = base64ToArrayBuffer(signatureBase64);

  const isValid = await window.crypto.subtle.verify(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    publicKey,
    signatureBuffer,
    dataBuffer
  );

  return isValid;
}
