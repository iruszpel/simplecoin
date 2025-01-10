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

  forks: Block[][];
  activeForkIndex: number;

  setDisableValidation: (disableValidation: boolean) => void;
  isValidationDisabled: () => boolean;
  getBlockchain: () => Block[];
  getLatestBlock: () => Block;
  minePendingTransactions: (miningRewardAddress: string) => Promise<void>;
  createTransaction: (transaction: Transaction) => Promise<void>;
  getBalanceOfAddress: (address: string, chain?: Block[]) => number;
  addBlock: (block: Block) => Promise<boolean>;
  replaceChain: (newChain: Block[]) => Promise<boolean>;
  clearPendingTransactions: () => void;
  validateTransaction: (
    transaction: Transaction,
    chain?: Block[],
    pendingTransactions?: Transaction[]
  ) => Promise<boolean>;
  validateChain: (chain: Block[]) => Promise<boolean>;

  addFork: (fork: Block[]) => void;
  getForks: () => Block[][];
  switchToFork: (forkIndex: number) => void;
  recycleTransactions: (block: Block) => void;
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

  forks: [],
  activeForkIndex: 0,

  addFork: (fork: Block[]) => {
    set((state) => ({
      forks: [...state.forks, fork],
    }));
  },

  getForks: () => {
    return get().forks;
  },

  switchToFork: (forkIndex: number) => {
    const { forks } = get();
    if (forkIndex >= 0 && forkIndex < forks.length) {
      set({
        chain: forks[forkIndex],
        activeForkIndex: forkIndex,
      });
    }
  },

  recycleTransactions: async (block: Block) => {
    const { chain, pendingTransactions, validateTransaction } = get();
    const chainTxIds = new Set(
      chain.flatMap((b) => b.transactions.map((tx) => tx.id))
    );

    const validNewTxs: Transaction[] = [];
    for (const tx of block.transactions) {
      if (!chainTxIds.has(tx.id) && tx.fromAddress !== null) {
        const isValidTx = await validateTransaction(
          tx,
          chain,
          pendingTransactions
        );
        if (isValidTx) {
          validNewTxs.push(tx);
        }
      }
    }

    if (validNewTxs.length > 0) {
      set({
        pendingTransactions: [...pendingTransactions, ...validNewTxs],
      });
    }
  },

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

    const newBlock = new Block(
      chain.length,
      Date.now(),
      [coinbaseTx, ...pendingTransactions],
      getLatestBlock().hash
    );

    set({ isMining: true });
    await newBlock.mineBlock(difficulty);
    set((state) => ({
      chain: [...state.chain, newBlock],
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
    const { chain, validateChain, forks, disableValidation } = get();
    console.log("Attempting to add block:", block);

    if (disableValidation) {
      set({ chain: [...chain, block] });
      console.log("Block added to the main chain.");
      return true;
    }

    if (block.previousHash === chain[chain.length - 1].hash) {
      console.log("Block is a direct extension of the main chain.");
      const newChain = [...chain, block];
      const isValid = await validateChain(newChain);

      if (isValid) {
        set({ chain: newChain });
        console.log("Block added to the main chain.");
        return true;
      } else {
        get().recycleTransactions(block);
        console.log("Block is invalid. Transactions recycled.");
        return false;
      }
    }

    for (let i = 0; i < forks.length; i++) {
      const fork = forks[i];
      if (block.previousHash === fork[fork.length - 1].hash) {
        console.log(`Block is a direct extension of fork ${i}.`);
        const newFork = [...fork, block];
        const isValid = await validateChain(newFork);

        if (isValid) {
          set((state) => ({
            forks: state.forks.map((f, idx) => (idx === i ? newFork : f)),
          }));
          console.log(`Block added to fork ${i}.`);

          if (newFork.length > chain.length) {
            get().switchToFork(i);
            console.log(`Switched to fork ${i} as the main chain.`);
          }
          return true;
        } else {
          get().recycleTransactions(block);
          console.log(`Block is invalid in fork ${i}. Transactions recycled.`);
          return false;
        }
      }
    }

    const parentBlock = chain.find((b) => b.hash === block.previousHash);
    if (parentBlock) {
      const parentIndex = chain.indexOf(parentBlock);
      console.log("Block is creating a new fork.");
      const newFork = [...chain.slice(0, parentIndex + 1), block];
      const isValid = await validateChain(newFork);

      if (isValid) {
        get().addFork(newFork);
        console.log("New fork created and block added.");
        return true;
      } else {
        get().recycleTransactions(block);
        console.log("Block is invalid in new fork. Transactions recycled.");
        return false;
      }
    }

    get().recycleTransactions(block);
    console.log(
      "Block is invalid and does not fit anywhere. Transactions recycled."
    );
    return false;
  },

  replaceChain: async (newChain: Block[]): Promise<boolean> => {
    const { chain, validateChain, disableValidation, pendingTransactions } =
      get();

    if (disableValidation) {
      set({ chain: newChain });

      return true;
    }

    const isValid = await validateChain(newChain);
    if (!isValid) {
      return false;
    }

    const newChainTxIds = new Set(
      newChain.flatMap((block) => block.transactions.map((tx) => tx.id))
    );

    const newPendingTransactions = pendingTransactions.filter(
      (tx) => !newChainTxIds.has(tx.id)
    );

    if (newChain.length < chain.length) {
      get().addFork(newChain);
      return false;
    }

    if (newChain.length === chain.length) {
      get().addFork(newChain);

      return false;
    }

    set({
      chain: newChain,
      pendingTransactions: newPendingTransactions,
      forks: [],
    });
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
        const isValidTx = await validateTransaction(
          transaction,
          chainUpToPrevious,
          []
        );
        if (!isValidTx) {
          console.error(
            `Invalid transaction ${transaction.id} in block ${currentBlock.index}`
          );
          return false;
        }
      }

      const coinbaseTxs = currentBlock.transactions.filter(
        (tx) => tx.fromAddress === null
      );
      if (coinbaseTxs.length !== 1) {
        console.error(
          `Invalid coinbase transaction count in block ${currentBlock.index}`
        );
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

        const isValidSig = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          cryptoKey,
          signatureBuffer,
          msgBuffer
        );

        if (!isValidSig) {
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
