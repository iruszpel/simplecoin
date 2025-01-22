import { create } from "zustand";
import { Block, Transaction } from "./Block";
import { BlockchainState } from "./Blockchain";

interface MaliciousNodeState {
  enabled: boolean;
  withholding: boolean;
  forkHeight?: number;

  setEnabled: (enabled: boolean) => void;
  setWithholding: (withholding: boolean) => void;
  setForkHeight: (height: number) => void;

  createInvalidBlock: (blockchain: BlockchainState) => Promise<void>;
  attemptDoubleSpend: (blockchain: BlockchainState) => Promise<void>;
  reorgChain: (blockchain: BlockchainState) => Promise<void>;
}

export const useMaliciousNodeStore = create<MaliciousNodeState>((set, get) => ({
  enabled: false,
  withholding: false,

  setEnabled: (enabled) => set({ enabled }),
  setWithholding: (withholding) => set({ withholding }),
  setForkHeight: (height) => set({ forkHeight: height }),

  createInvalidBlock: async (blockchain) => {
    if (!get().enabled) return;

    const latestBlock = blockchain.getLatestBlock();

    const invalidBlock = new Block(
      latestBlock.index + 1,
      Date.now(),
      [],
      "hashzupełniewymyślony"
    );
    invalidBlock.hash = "hashzupełniewymyślony";

    await blockchain.addBlock(invalidBlock);
  },

  attemptDoubleSpend: async (blockchain) => {
    if (!get().enabled) return;

    const chain = blockchain.getBlockchain();

    let targetTx: Transaction | null = null;
    for (const block of chain) {
      const normalTx = block.transactions.find((tx) => tx.fromAddress !== null);
      if (normalTx) {
        targetTx = normalTx;
        break;
      }
    }

    if (!targetTx) {
      console.warn("No suitable transaction found for double spend");
      return;
    }

    const duplicateTx1: Transaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      fromAddress: targetTx.fromAddress,
      toAddress: "AddressA",
      amount: targetTx.amount,
      nonce: crypto.randomUUID(),
      publicKey: targetTx.publicKey,
      signature: targetTx.signature,
    };

    const duplicateTx2: Transaction = {
      ...duplicateTx1,
      id: crypto.randomUUID(),
      toAddress: "AddressB",
      nonce: crypto.randomUUID(),
    };

    try {
      await blockchain.createTransaction(duplicateTx1);
      await blockchain.createTransaction(duplicateTx2);
      console.log("Double spend transactions created");
    } catch (err) {
      console.warn("Failed to create double spend transactions:", err);
    }
  },

  reorgChain: async (blockchain) => {
    if (!get().enabled) return;

    const chain = blockchain.getBlockchain();
    if (chain.length < 3) return;

    const newChain = chain.slice(0, chain.length - 1);

    const lastBlock = chain[chain.length - 1];
    lastBlock.transactions = [];

    newChain.push(lastBlock);
    await blockchain.replaceChain(newChain);
  },
}));
