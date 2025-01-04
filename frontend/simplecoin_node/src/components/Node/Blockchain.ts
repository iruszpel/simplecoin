import { create } from "zustand";
import { Block, Transaction } from "./Block";
import { base64ToArrayBuffer, generateWalletAddress } from "./utils";

export interface BlockchainState {
  chain: Block[];
  difficulty: number;
  pendingTransactions: Transaction[];
  isMining: boolean;
  miningReward: number;
  disableValidation: boolean;
  setDisableValidation: (disableValidation: boolean) => void;
  isValidationDisabled: () => boolean;
  getBlockchain: () => Block[];
  getLatestBlock: () => Block;
  minePendingTransactions: (miningRewardAddress: string) => Promise<void>;
  createTransaction: (transaction: Transaction) => Promise<void>;
  getBalanceOfAddress: (address: string, chain: Block[]) => number;
  addBlock: (block: Block) => Promise<boolean>;
  replaceChain: (newChain: Block[]) => Promise<boolean>;
  clearPendingTransactions: () => void;
  validateTransaction: (
    transaction: Transaction,
    chain?: Block[],
    pendingTransactions?: Transaction[]
  ) => Promise<boolean>;
  validateChain: (chain: Block[]) => Promise<boolean>;
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
  disableValidation: false,

  setDisableValidation: (disableValidation: boolean) => {
    set({ disableValidation });
  },

  isValidationDisabled: () => {
    return get().disableValidation;
  },

  getBlockchain: () => {
    return get().chain;
  },

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
      nonce: crypto.randomUUID(),
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

  createTransaction: async (transaction: Transaction) => {
    const isValid = await get().validateTransaction(transaction);
    if (!isValid) {
      throw new Error("Invalid transaction");
    }

    set((state) => ({
      pendingTransactions: [...state.pendingTransactions, transaction],
    }));
  },

  getBalanceOfAddress: (
    address: string,
    chain: Block[] = get().chain
  ): number => {
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
    const { chain, validateChain } = get();
    const newChain = [...chain, block];
    const isValid = await validateChain(newChain);

    if (!isValid) {
      console.error("New block is invalid");
      return false;
    }

    set({ chain: newChain, pendingTransactions: [] });
    return true;
  },

  replaceChain: async (newChain: Block[]): Promise<boolean> => {
    const { chain, validateChain, disableValidation } = get();
    console.log("Replacing chain", newChain);

    if (disableValidation) {
      set({ chain: newChain });
      return true;
    }

    if (!newChain || newChain.length === 0) {
      console.error("Received empty chain");
      return false;
    }

    if (newChain.length <= chain.length) {
      console.error("Received chain is not longer than current chain");
      return false;
    }

    const isValid = await validateChain(newChain);
    if (!isValid) {
      console.error("Received chain is invalid");
      return false;
    }

    set({ chain: newChain });
    return true;
  },

  clearPendingTransactions: () => {
    set({ pendingTransactions: [] });
  },

  validateChain: async (chain: Block[]): Promise<boolean> => {
    const { difficulty, validateTransaction, disableValidation } = get();

    if (disableValidation) {
      return true;
    }

    const genesisBlock = chain[0];
    if (
      genesisBlock.hash !==
      "0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      console.error("Invalid genesis block");
      return false;
    }

    for (let i = 1; i < chain.length; i++) {
      const currentBlock = chain[i];
      const previousBlock = chain[i - 1];

      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error(`Invalid previous hash at block ${currentBlock.index}`);
        return false;
      }

      const isValidBlock = await currentBlock.isValid(difficulty);
      if (!isValidBlock) {
        console.error(`Invalid proof of work at block ${currentBlock.index}`);
        return false;
      }

      const chainUpToPrevious = chain.slice(0, i);

      for (const transaction of currentBlock.transactions) {
        const isValidTransaction = await validateTransaction(
          transaction,
          chainUpToPrevious,
          []
        );
        if (!isValidTransaction) {
          console.error(
            `Invalid transaction ${transaction.id} in block ${currentBlock.index}`
          );
          return false;
        }
      }

      const coinbaseTransactions = currentBlock.transactions.filter(
        (tx) => tx.fromAddress === null
      );

      if (coinbaseTransactions.length !== 1) {
        console.error("Invalid coinbase transaction");
        return false;
      }
    }

    return true;
  },

  validateTransaction: async (
    transaction: Transaction,
    chain: Block[] = get().chain,
    pendingTransactions: Transaction[] = get().pendingTransactions
  ): Promise<boolean> => {
    const { miningReward, disableValidation } = get();

    if (disableValidation) {
      return true;
    }

    if (transaction.fromAddress === null) {
      if (transaction.toAddress === null) {
        console.error("Invalid coinbase transaction");
        return false;
      }

      if (transaction.amount !== miningReward) {
        console.error("Invalid mining reward amount");
        return false;
      }

      return true;
    }

    if (
      !transaction.fromAddress ||
      !transaction.toAddress ||
      transaction.amount <= 0
    ) {
      console.error("Invalid transaction structure");
      return false;
    }

    if (!transaction.publicKey) {
      console.error("Public key is missing");
      return false;
    }

    const generatedAddress = await generateWalletAddress(transaction.publicKey);
    if (generatedAddress !== transaction.fromAddress) {
      console.error("Public key does not match fromAddress");
      return false;
    }

    if (transaction.timestamp > Date.now()) {
      console.error("Invalid timestamp");
      return false;
    }

    const isTransactionExists =
      chain.some((block) =>
        block.transactions.some((tx) => tx.id === transaction.id)
      ) || pendingTransactions.some((tx) => tx.id === transaction.id);

    if (isTransactionExists) {
      console.error("Transaction already exists");
      return false;
    }

    const senderBalance = get().getBalanceOfAddress(
      transaction.fromAddress,
      chain
    );

    const pendingAmount = pendingTransactions
      .filter((tx) => tx.fromAddress === transaction.fromAddress)
      .reduce((sum, tx) => sum + tx.amount, 0);

    if (senderBalance - pendingAmount < transaction.amount) {
      console.error("Not enough balance");
      return false;
    }

    if (transaction.signature && transaction.publicKey) {
      try {
        const msgBuffer = new TextEncoder().encode(
          transaction.id +
            transaction.timestamp +
            transaction.fromAddress +
            transaction.toAddress +
            transaction.nonce +
            transaction.amount
        );
        const keyBuffer = base64ToArrayBuffer(transaction.publicKey);
        const signatureBuffer = base64ToArrayBuffer(transaction.signature);

        const cryptoKey = await crypto.subtle.importKey(
          "raw",
          keyBuffer,
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["verify"]
        );

        const isValid = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          cryptoKey,
          signatureBuffer,
          msgBuffer
        );

        if (!isValid) {
          console.error("Invalid signature");
          return false;
        }
      } catch (error) {
        console.error("Signature verification failed", error);
        return false;
      }
    }

    return true;
  },
}));
