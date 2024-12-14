export function base64ToArrayBuffer(base64: string): ArrayBuffer {
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
