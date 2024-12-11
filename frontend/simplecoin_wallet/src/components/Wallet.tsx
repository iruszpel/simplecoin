/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  WalletIcon,
  LockIcon,
  UnlockIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  generateKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
  generateWalletAddress,
  signTransaction,
  verifySignature,
} from "../utils/crypto";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const walletDataArrayMock: {
  address: string;
  balance: number;
  transactions: {
    id: string;
    type: string;
    amount: number;
    from?: string;
    to?: string;
    date: string;
    isValid: boolean;
  }[];
}[] = [
  {
    address: "",
    balance: 0,
    transactions: [],
  },
];

export type Transaction = {
  id: string;
  timestamp: number;
  fromAddress: string;
  toAddress: string;
  amount: number;
  nonce: string;
  signature?: string;
  publicKey: string;
};

export function Wallet() {
  const [password, setPassword] = useState("");
  const [walletDataArray, setWalletDataArray] = useState(walletDataArrayMock);
  const [keyPairs, setKeyPairs] = useState<
    Array<{
      publicKey: string;
      encryptedPrivateKey: string;
      decryptedPrivateKey?: string;
      walletAddress: string;
    }>
  >([]);
  const [selectedKeyPairIndex, setSelectedKeyPairIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [importChainJson, setImportChainJson] = useState("");
  const [chainData, setChainData] = useState([]); // przechowujemy zaimportowany łańcuch

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionJson, setTransactionJson] = useState("");

  const selectedKeyPair =
    keyPairs && keyPairs.length > 0 ? keyPairs[selectedKeyPairIndex] : null;

  useEffect(() => {
    const keyPairsJson = localStorage.getItem("keyPairs");
    if (keyPairsJson) {
      const storedKeyPairs = JSON.parse(keyPairsJson);

      Promise.all(
        storedKeyPairs.map(async (keyPair: { publicKey: string }) => {
          const walletAddress = await generateWalletAddress(keyPair.publicKey);
          return { ...keyPair, walletAddress };
        })
      ).then((keyPairsWithAddresses) => {
        setKeyPairs(keyPairsWithAddresses);
      });
    }
  }, []);

  const handleCreateIdentity = async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const encryptedPrivateKey = await encryptPrivateKey(privateKey, password);
    const walletAddress = await generateWalletAddress(publicKey);
    const newKeyPair = { publicKey, encryptedPrivateKey, walletAddress };
    const updatedKeyPairs = keyPairs ? [...keyPairs, newKeyPair] : [newKeyPair];
    setKeyPairs(updatedKeyPairs);
    localStorage.setItem("keyPairs", JSON.stringify(updatedKeyPairs));
    setSelectedKeyPairIndex(updatedKeyPairs.length - 1);
    setError(null);
  };

  const handleDecryptIdentity = async () => {
    try {
      if (!keyPairs || keyPairs.length === 0) {
        setError("No keys found. Please create an identity first.");
        return;
      }
      const keyPair = keyPairs[selectedKeyPairIndex];
      const decryptedPrivateKey = await decryptPrivateKey(
        keyPair.encryptedPrivateKey,
        password
      );
      const updatedKeyPair = { ...keyPair, decryptedPrivateKey };
      const updatedKeyPairs = [...keyPairs];
      updatedKeyPairs[selectedKeyPairIndex] = updatedKeyPair;
      setKeyPairs(updatedKeyPairs);

      const keyPairsToSave = updatedKeyPairs.map(
        ({ decryptedPrivateKey, ...rest }) => rest
      );
      localStorage.setItem("keyPairs", JSON.stringify(keyPairsToSave));

      setError(null);
    } catch (e) {
      console.error(e);
      setError("Incorrect password. Please try again.");
    }
  };

  const validateTransaction = async (tx: any) => {
    if (!tx.fromAddress) {
      return true;
    }

    if (!tx.signature || !tx.publicKey) {
      return false;
    }

    try {
      return await verifySignature(tx, tx.signature);
    } catch (error) {
      console.error("Transaction validation failed:", error);
      return false;
    }
  };

  const computeBalanceAndTransactions = async (
    chain: { transactions: Transaction[] }[],
    address: string | undefined
  ) => {
    let balance = 0;
    const transactions = [];

    for (const block of chain) {
      for (const tx of block.transactions) {
        const isValid = await validateTransaction(tx);

        if (tx.toAddress === address) {
          balance += tx.amount;
          transactions.push({ ...tx, type: "Received", isValid });
        }
        if (tx.fromAddress === address) {
          balance -= tx.amount;
          transactions.push({ ...tx, type: "Sent", isValid });
        }
      }
    }
    return { balance, transactions };
  };

  const selectedWalletData =
    walletDataArray[selectedKeyPairIndex] || walletDataArray[0];

  const handleImportChain = async () => {
    try {
      const parsed = JSON.parse(importChainJson);
      setChainData(parsed);

      const updatedWalletDataArray = await Promise.all(
        keyPairs.map(async (keyPair) => {
          const { balance, transactions } = await computeBalanceAndTransactions(
            parsed,
            keyPair.walletAddress
          );

          return {
            address: keyPair.walletAddress,
            balance,
            transactions: transactions.map((tx) => ({
              ...tx,
              from: tx.fromAddress,
              to: tx.toAddress,
              date: new Date(tx.timestamp).toISOString().split("T")[0],
            })),
          };
        })
      );

      setWalletDataArray(updatedWalletDataArray);
      setImportChainJson("");
    } catch (error) {
      console.error("Invalid chain JSON", error);
    }
  };

  const handleGenerateTransactionJson = async () => {
    if (!selectedKeyPair?.decryptedPrivateKey) {
      setError("Please decrypt your private key first.");
      return;
    }

    const tx: Transaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      fromAddress: selectedKeyPair.walletAddress,
      toAddress: recipient,
      amount: parseFloat(amount),
      nonce: crypto.randomUUID(),
      publicKey: selectedKeyPair.publicKey,
    };

    const signature = await signTransaction(
      tx,
      selectedKeyPair.decryptedPrivateKey
    );
    tx.signature = signature;

    setTransactionJson(JSON.stringify(tx, null, 2));
  };

  return (
    <div className="flex flex-col w-full min-h-screen">
      <header className="flex items-center h-16 px-4 border-b shrink-0 md:px-6">
        <WalletIcon className="w-6 h-6 mr-2" />
        <h1 className="text-lg font-semibold">
          SimpleCoin Wallet - Zbijaj kokosy nie ruszając się z kanapy!
        </h1>
      </header>
      <main className="flex min-h-[calc(100vh_-_theme(spacing.16))] bg-muted/40 flex-1 flex-col gap-4 p-4 md:gap-8 md:p-10">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {selectedKeyPair && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Current Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {selectedWalletData.balance.toFixed(2)} SC
                </div>
                <p className="text-xs text-muted-foreground">SimpleCoin</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Public Key
                </CardTitle>
                <Button
                  size="icon"
                  onClick={() =>
                    navigator.clipboard.writeText(selectedKeyPair?.publicKey)
                  }
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-medium truncate">
                  {selectedKeyPair?.publicKey || "No key generated"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Wallet Address
                </CardTitle>
                <Button
                  size="icon"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      selectedKeyPair?.walletAddress ?? ""
                    )
                  }
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-medium truncate">
                  {selectedKeyPair?.walletAddress || "Generating..."}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Send SimpleCoin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Input
                    placeholder="Recipient Address"
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Amount"
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={handleGenerateTransactionJson}
                  >
                    Send
                  </Button>
                </div>
                {transactionJson && (
                  <div>
                    <Label>Signed Transaction JSON</Label>
                    <Textarea value={transactionJson} readOnly />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Key Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateIdentity} disabled={!password}>
                  <LockIcon className="mr-2 h-4 w-4" />
                  Create Identity
                </Button>
                <Button
                  onClick={handleDecryptIdentity}
                  disabled={!password || !selectedKeyPair}
                >
                  <UnlockIcon className="mr-2 h-4 w-4" />
                  Decrypt Identity
                </Button>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Select Address</Label>
                <Select
                  value={selectedKeyPairIndex.toString()}
                  onValueChange={(e) => setSelectedKeyPairIndex(parseInt(e))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a verified email to display" />
                  </SelectTrigger>
                  <SelectContent>
                    {keyPairs?.map((keyPair, index) => (
                      <SelectItem key={index} value={index.toString()}>
                        {keyPair.walletAddress}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 items-center">
                <Label htmlFor="privateKey">Private Key</Label>
                <Button
                  size="icon"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {selectedKeyPair?.decryptedPrivateKey && showPrivateKey && (
                <Textarea
                  value={selectedKeyPair.decryptedPrivateKey}
                  readOnly
                  placeholder="Decrypted private key will appear here"
                />
              )}
              <div className="grid gap-2">
                <Label htmlFor="publicKey">Public Key</Label>
                <Textarea
                  id="publicKey"
                  value={selectedKeyPair?.publicKey}
                  readOnly
                  placeholder="Public key will appear here"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="walletAddress">Wallet Address</Label>
                <Textarea
                  id="walletAddress"
                  value={selectedKeyPair?.walletAddress ?? ""}
                  readOnly
                  placeholder="Wallet address will appear here"
                />
              </div>
            </div>
          </CardContent>
        </Card>
        {selectedKeyPair && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>From/To</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Valid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedWalletData.transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        {transaction.type === "Received" ? (
                          <ArrowDownIcon className="mr-2 h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowUpIcon className="mr-2 h-4 w-4 text-red-500" />
                        )}
                        {transaction.type}
                      </TableCell>
                      <TableCell>{transaction.amount} SC</TableCell>
                      <TableCell className="font-mono">
                        {transaction.from || transaction.to}
                      </TableCell>
                      <TableCell>{transaction.date}</TableCell>
                      <TableCell>
                        {transaction.from ? (
                          transaction.isValid ? (
                            <span className="text-green-500">✓</span>
                          ) : (
                            <span className="text-red-500">✗</span>
                          )
                        ) : (
                          <span className="text-gray-500">Coinbase</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        <div>
          <h2>Import Blockchain</h2>
          <Textarea
            placeholder="Wklej tutaj JSON łańcucha"
            value={importChainJson}
            onChange={(e) => setImportChainJson(e.target.value)}
          />
          <Button onClick={handleImportChain}>Zaimportuj łańcuch</Button>
        </div>
      </main>
    </div>
  );
}
