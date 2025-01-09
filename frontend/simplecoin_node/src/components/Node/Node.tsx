/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { v4 as uuidv4 } from "uuid";
import { useBlockchainStore } from "./Blockchain";

import { usePeerConnections } from "./hooks/usePeerConnections";
import { useSignaling } from "./hooks/useSignaling";
import { useMessaging } from "./hooks/useMessaging";
import { Block, Transaction } from "./Block";
import { useMaliciousNodeStore } from "./MaliciousNode";

export const Node: React.FC = () => {
  const [nodeId] = useState<string>(uuidv4());
  const [localSDP, setLocalSDP] = useState<string>("");
  const [remoteSDP, setRemoteSDP] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);
  const [rewardAddress, setRewardAddress] = useState<string>(nodeId);
  const [transactionJson, setTransactionJson] = useState<string>("");
  const seenMessages = useRef<Set<string>>(new Set());
  const maliciousNode = useMaliciousNodeStore();

  const blockchain = useBlockchainStore();
  const currentBlock = blockchain.getLatestBlock();
  const isMining = blockchain.isMining;

  const handleReceivedBlock = async (blockData: any) => {
    const newBlock = new Block(
      blockData.index,
      blockData.timestamp,
      blockData.transactions,
      blockData.previousHash
    );
    newBlock.hash = blockData.hash;
    newBlock.nonce = blockData.nonce;

    try {
      const success = await blockchain.addBlock(newBlock);

      if (success) {
        setMessages((prev) => [
          ...prev,
          `Received valid block ${newBlock.index} and added to chain`,
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          `Received invalid block ${newBlock.index} (could not add)`,
          `Requesting blockchain from peers...`,
        ]);

        handleBroadcastToAllButSome(
          {
            type: "message",
            messageType: "request-blockchain",
            nodeId,
            messageId: window.crypto.randomUUID(),
          },
          []
        );
      }
    } catch (error) {
      setMessages((prev) => [...prev, `Block error: ${error}`]);
    }
  };

  const handleReceivedTransaction = (transactionData: any) => {
    const transaction: Transaction = transactionData;
    blockchain.createTransaction(transaction);
    setMessages((prev) => [...prev, `Received transaction ${transaction.id}`]);
  };

  const handleReceivedBlockchain = async (receivedChainData: any[]) => {
    const receivedChain: Block[] = await Promise.all(
      receivedChainData.map(async (blockData: any) => {
        const block = new Block(
          blockData.index,
          blockData.timestamp,
          blockData.transactions,
          blockData.previousHash
        );
        block.hash = blockData.hash;
        block.nonce = blockData.nonce;
        return block;
      })
    );

    const isValid = await blockchain.replaceChain(receivedChain);
    if (isValid) {
      blockchain.clearPendingTransactions();

      setMessages((prev) => [
        ...prev,
        `Blockchain updated with received chain. Pending transactions cleared.`,
      ]);
    } else {
      setMessages((prev) => [...prev, `Received invalid blockchain`]);
    }
  };

  const handleDataChannelMessage = async (data: any, senderId: string) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case "peer-list": {
        const newPeers = message.peers.filter(
          (id: string) => id !== nodeId && !knownPeers.has(id)
        );
        newPeers.forEach((id: string) => {
          setKnownPeers((prev) => new Map(prev.set(id, null)));
        });
        break;
      }

      case "offer":
      case "answer":
        handleSignalingMessage(message);
        break;

      case "message": {
        if (!seenMessages.current.has(message.messageId)) {
          seenMessages.current.add(message.messageId);

          switch (message.messageType) {
            case "text":
              setMessages((prev) => [
                ...prev,
                `From ${senderId}: ${message.content} (original sender: ${message.nodeId})`,
              ]);
              break;

            case "new-block":
              await handleReceivedBlock(message.block);
              setMessages((prev) => [
                ...prev,
                `Received new block from ${senderId}`,
              ]);
              break;

            case "blockchain":
              await handleReceivedBlockchain(message.chain);
              setMessages((prev) => [
                ...prev,
                `Received blockchain from ${senderId}`,
              ]);
              break;

            case "new-transaction":
              try {
                handleReceivedTransaction(message.transaction);
              } catch (error) {
                setMessages((prev) => [...prev, `Transaction error: ${error}`]);
              }
              break;

            case "request-blockchain":
              setMessages((prev) => [
                ...prev,
                `Received blockchain request from ${senderId}`,
              ]);
              dataChannels.current.forEach((channel, peerId) => {
                if (peerId === senderId && channel.readyState === "open") {
                  const blockchainMessage = {
                    type: "message",
                    messageType: "blockchain",
                    chain: blockchain.getBlockchain(),
                    nodeId,
                    messageId: window.crypto.randomUUID(),
                  };
                  setMessages((prev) => [
                    ...prev,
                    `Sending blockchain to ${senderId} because they requested it`,
                  ]);
                  channel.send(JSON.stringify(blockchainMessage));
                }
              });
              break;

            default:
              console.log("Unknown messageType", message.messageType);
              break;
          }

          handleBroadcastToAllButSome(message, [senderId, message.nodeId]);
        }
        break;
      }

      default:
        break;
    }
  };

  const broadcastBlock = (block: Block) => {
    const message = {
      type: "message",
      messageType: "new-block",
      block,
      nodeId,
      messageId: window.crypto.randomUUID(),
    };

    dataChannels.current.forEach((channel) => {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify(message));
      }
    });
  };

  const broadcastTransaction = (transaction: Transaction) => {
    const message = {
      type: "message",
      messageType: "new-transaction",
      transaction,
      nodeId,
      messageId: window.crypto.randomUUID(),
    };

    dataChannels.current.forEach((channel) => {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify(message));
      }
    });
  };

  const handleMineTransactions = async () => {
    await blockchain.minePendingTransactions(rewardAddress);
    if (!maliciousNode.withholding) {
      broadcastBlock(blockchain.getLatestBlock());
    }
    setMessages((prev) => [...prev, "Mined new block"]);
  };

  const onDataChannelOpen = (remoteNodeId: string, channel: RTCDataChannel) => {
    const blockchainMessage = {
      type: "message",
      messageType: "blockchain",
      chain: blockchain.getBlockchain(),
      nodeId,
      messageId: window.crypto.randomUUID(),
    };
    channel.send(JSON.stringify(blockchainMessage));
  };

  const {
    peerConnections,
    dataChannels,
    knownPeers,
    openChannelNodeIds,
    createPeerConnection,
    setupDataChannel,
    setKnownPeers,
    setOpenChannelNodeIds,
  } = usePeerConnections(
    nodeId,
    setMessages,
    handleDataChannelMessage,
    onDataChannelOpen
  );

  const {
    handleCreateOffer,
    handleSetRemoteDescription,
    handleSignalingMessage,
    handleConnectToPeer,
  } = useSignaling(
    nodeId,
    peerConnections,
    dataChannels,
    createPeerConnection,
    setupDataChannel,
    setLocalSDP
  );

  const {
    messageToSend,
    setMessageToSend,
    handleBroadcastMessage,
    handleBroadcastToAllButSome,
  } = useMessaging(nodeId, dataChannels, setMessages);

  const handleExportBlockchain = () => {
    const blockchainJSON = JSON.stringify(blockchain.chain, null, 2);
    navigator.clipboard.writeText(blockchainJSON);
    setMessages((prev) => [...prev, "Blockchain copied to clipboard"]);
  };

  const handleAddTransactionFromJson = async () => {
    try {
      const transactionData: Transaction = JSON.parse(transactionJson);
      await blockchain.createTransaction(transactionData);

      broadcastTransaction(transactionData);

      setMessages((prev) => [
        ...prev,
        `Transaction ${transactionData.id} added and broadcasted`,
      ]);
      setTransactionJson("");
    } catch (error) {
      setMessages((prev) => [...prev, `Failed to add transaction: ${error}`]);
    }
  };

  return (
    <div className="node">
      <h1>Node ID: {nodeId}</h1>

      <div>
        <h2>Current Block</h2>
        <p>Index: {currentBlock.index}</p>
        <p>Hash: {currentBlock.hash}</p>
      </div>

      <div>
        <h2>Mining Status</h2>
        <p>{isMining ? "Mining in progress..." : "Idle"}</p>
      </div>

      <div>
        <h2>Create Offer</h2>
        <Button onClick={handleCreateOffer}>Create Offer</Button>
      </div>

      <div>
        <h2>Local SDP (Copy and send to remote peer)</h2>
        <Textarea value={localSDP} readOnly rows={10} cols={60} />
      </div>

      <div>
        <h2>Remote SDP (Paste received SDP)</h2>
        <Textarea
          value={remoteSDP}
          onChange={(e) => setRemoteSDP(e.target.value)}
          rows={10}
          cols={60}
        />
        <Button onClick={() => handleSetRemoteDescription(remoteSDP)}>
          Set Remote Description
        </Button>
      </div>

      <div>
        <h2>Known Peers</h2>
        <ul>
          {Array.from(knownPeers.keys()).map((peerId) => (
            <li key={peerId}>
              {peerId}
              {openChannelNodeIds.includes(peerId) ? null : (
                <Button onClick={() => handleConnectToPeer(peerId)}>
                  Connect
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <Input
          type="text"
          placeholder="Type a message"
          value={messageToSend}
          onChange={(e) => setMessageToSend(e.target.value)}
        />
        <Button onClick={() => handleBroadcastMessage()}>Send</Button>
      </div>

      <div>
        <h2>Messages</h2>
        <ul>
          {messages.map((msg, idx) => (
            <li key={idx}>{msg}</li>
          ))}
        </ul>
      </div>

      <div>
        <h2>Mine Pending Transactions</h2>
        <Input
          type="text"
          placeholder="Reward Address"
          value={rewardAddress}
          onChange={(e) => setRewardAddress(e.target.value)}
        />
        <Button onClick={handleMineTransactions}>Mine Transactions</Button>
      </div>

      <div>
        <h2>Export Blockchain</h2>
        <Button onClick={handleExportBlockchain}>Export to JSON</Button>
      </div>

      <div>
        <h2>Paste Transaction JSON</h2>
        <Textarea
          placeholder="Paste transaction JSON here"
          value={transactionJson}
          onChange={(e) => setTransactionJson(e.target.value)}
          rows={10}
          cols={60}
        />
        <Button onClick={handleAddTransactionFromJson}>Add Transaction</Button>
      </div>

      <div>
        <h2>Malicious Node Testing</h2>
        <div>
          <input
            type="checkbox"
            checked={maliciousNode.enabled}
            onChange={(e) => {
              maliciousNode.setEnabled(e.target.checked);
              setMessages((prev) => [
                ...prev,
                `Malicious node: ${e.target.checked ? "ENABLED" : "DISABLED"}`,
              ]);
            }}
          />
          <label>Enable Malicious Behavior</label>
        </div>

        {maliciousNode.enabled && (
          <div className="flex flex-col">
            <div>
              <input
                type="checkbox"
                checked={maliciousNode.withholding}
                onChange={(e) => {
                  maliciousNode.setWithholding(e.target.checked);
                  setMessages((prev) => [
                    ...prev,
                    `Block withholding: ${e.target.checked ? "ON" : "OFF"}`,
                  ]);
                }}
              />
              <label>Enable Withholding</label>
            </div>

            <div>
              <input
                type="checkbox"
                checked={blockchain.disableValidation}
                onChange={(e) => {
                  blockchain.setDisableValidation(e.target.checked);
                  setMessages((prev) => [
                    ...prev,
                    `Validation disabled: ${e.target.checked ? "ON" : "OFF"}`,
                  ]);
                }}
              />
              <label>
                Disable Validation of incoming transactions/blocks/blockchains
              </label>
            </div>
          </div>
        )}

        {maliciousNode.enabled && (
          <div className="flex flex-row space-x-2">
            <Button
              onClick={() =>
                maliciousNode
                  .createInvalidBlock(blockchain)
                  .then(() =>
                    setMessages((prev) => [
                      ...prev,
                      "Malicious node tried to publish invalid block.",
                    ])
                  )
              }
            >
              Publish Invalid Block
            </Button>

            <Button
              onClick={() =>
                maliciousNode
                  .attemptDoubleSpend(blockchain)
                  .then(() =>
                    setMessages((prev) => [
                      ...prev,
                      "Malicious node attempts double spend.",
                    ])
                  )
              }
            >
              Double Spend
            </Button>

            <Button
              onClick={() =>
                maliciousNode
                  .reorgChain(blockchain)
                  .then(() =>
                    setMessages((prev) => [
                      ...prev,
                      "Malicious node forced chain reorg.",
                    ])
                  )
              }
            >
              Force Reorg
            </Button>
            <Button
              onClick={() =>
                handleBroadcastToAllButSome(
                  {
                    type: "message",
                    messageType: "blockchain",
                    chain: blockchain.getBlockchain(),
                    nodeId,
                    messageId: window.crypto.randomUUID(),
                  },
                  []
                )
              }
            >
              Broadcast current blockchain
            </Button>
            <Button
              onClick={() =>
                handleBroadcastToAllButSome(
                  {
                    type: "message",
                    messageType: "new-block",
                    block: blockchain.getLatestBlock(),
                    nodeId,
                    messageId: window.crypto.randomUUID(),
                  },
                  []
                )
              }
            >
              Broadcast last block only
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
