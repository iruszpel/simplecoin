export interface Transaction {
  id: string;
  timestamp: number;
  fromAddress: string | null;
  toAddress: string;
  amount: number;
  publicKey?: string;
  nonce: string;
  signature?: string;
}

export class Block {
  public index: number;
  public timestamp: number;
  public transactions: Transaction[];
  public previousHash: string;
  public hash: string;
  public nonce: number;

  constructor(
    index: number,
    timestamp: number,
    transactions: Transaction[],
    previousHash: string = ""
  ) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = "";
    this.nonce = 0;
  }

  async calculateHash(): Promise<string> {
    const data =
      this.index +
      this.previousHash +
      this.timestamp +
      JSON.stringify(this.transactions) +
      this.nonce;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  }

  async mineBlock(difficulty: number): Promise<void> {
    const target = "0".repeat(difficulty);
    do {
      this.nonce++;
      this.hash = await this.calculateHash();
    } while (!this.hash.startsWith(target));
  }

  async isValid(difficulty: number): Promise<boolean> {
    if (!this.hash.startsWith("0".repeat(difficulty))) {
      return false;
    }

    const calculatedHash = await this.calculateHash();
    return this.hash === calculatedHash;
  }
}
