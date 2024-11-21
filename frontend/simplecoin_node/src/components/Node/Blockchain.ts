// blockchainStore.ts
import { create } from "zustand";
import { Block, Transaction } from "./Block";

interface BlockchainState {
  chain: Block[];
  difficulty: number;
  pendingTransactions: Transaction[];
  isMining: boolean;
  miningReward: number;
  getLatestBlock: () => Block;
  minePendingTransactions: (miningRewardAddress: string) => Promise<void>;
  createTransaction: (transaction: Transaction) => void;
  getBalanceOfAddress: (address: string) => number;
  addBlock: (block: Block) => Promise<boolean>;
}

const genesisBlock = new Block(0, 17321402820000, [], "0");
genesisBlock.hash =
  "0000000000000000000000000000000000000000000000000000000000000000";

export const useBlockchainStore = create<BlockchainState>((set, get) => ({
  chain: [genesisBlock],
  difficulty: 2,
  pendingTransactions: [],
  miningReward: 50,
  isMining: false,

  getLatestBlock: () => {
    const { chain } = get();
    return chain[chain.length - 1];
  },

  minePendingTransactions: async (miningRewardAddress: string) => {
    const {
      chain,
      pendingTransactions,
      miningReward,
      difficulty,
      getLatestBlock,
    } = get();
    const coinbaseTx: Transaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      fromAddress: null,
      toAddress: miningRewardAddress,
      amount: miningReward,
    };

    const block = new Block(
      chain.length,
      Date.now(),
      [coinbaseTx, ...pendingTransactions],
      getLatestBlock().hash
    );

    set({ isMining: true });
    await block.mineBlock(difficulty);
    set((state) => ({
      chain: [...state.chain, block],
      pendingTransactions: [],
      isMining: false,
    }));
  },

  createTransaction: (transaction: Transaction) => {
    set((state) => ({
      pendingTransactions: [...state.pendingTransactions, transaction],
    }));
  },

  getBalanceOfAddress: (address: string) => {
    const { chain } = get();
    let balance = 0;

    for (const block of chain) {
      for (const trans of block.transactions) {
        if (trans.fromAddress === address) {
          balance -= trans.amount;
        }

        if (trans.toAddress === address) {
          balance += trans.amount;
        }
      }
    }

    return balance;
  },

  addBlock: async (block: Block): Promise<boolean> => {
    const { chain, difficulty, getLatestBlock } = get();

    // Verify previous hash links to our chain
    const latestBlock = getLatestBlock();
    if (block.previousHash !== latestBlock.hash) {
      console.error("Invalid previous hash");
      return false;
    }

    // Verify block index
    if (block.index !== chain.length) {
      console.error("Invalid block index");
      return false;
    }

    // Verify block is valid (hash + proof of work)
    const isValid = await block.isValid(difficulty);
    if (!isValid) {
      console.error("Invalid block hash/proof of work");
      return false;
    }

    // Add block to chain
    set((state) => ({
      chain: [...state.chain, block],
      pendingTransactions: [], // Clear pending transactions that are now in block
    }));
    return true;
  },
}));
