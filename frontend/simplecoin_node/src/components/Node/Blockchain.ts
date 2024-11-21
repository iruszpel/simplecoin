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
  replaceChain: (newChain: Block[]) => Promise<boolean>;
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

    const latestBlock = getLatestBlock();
    if (block.previousHash !== latestBlock.hash) {
      console.error("Invalid previous hash");
      return false;
    }

    if (block.index !== chain.length) {
      console.error("Invalid block index");
      return false;
    }

    const isValid = await block.isValid(difficulty);
    if (!isValid) {
      console.error("Invalid block hash/proof of work");
      return false;
    }

    set((state) => ({
      chain: [...state.chain, block],
      pendingTransactions: [],
    }));
    return true;
  },

  replaceChain: async (newChain: Block[]): Promise<boolean> => {
    const { chain, difficulty } = get();

    console.log("Received chain with length", newChain.length);
    console.log("Current chain length", chain.length);
    console.log("newChain", newChain);
    console.log("chain", chain);

    if (!newChain || newChain.length === 0) {
      console.error("Received empty chain");
      return false;
    }

    if (newChain.length <= chain.length) {
      console.error("Received chain is not longer than current chain");
      return false;
    }

    for (let i = 1; i < newChain.length; i++) {
      const currentBlock = newChain[i];
      const previousBlock = newChain[i - 1];

      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error("Invalid previous hash at block", currentBlock.index);
        return false;
      }

      const isValid = await currentBlock.isValid(difficulty);
      if (!isValid) {
        console.error("Invalid hash at block", currentBlock.index);
        return false;
      }
    }

    set({ chain: newChain });
    return true;
  },
}));
