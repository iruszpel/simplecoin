/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { v4 as uuidv4 } from "uuid";

import { usePeerConnections } from "./hooks/usePeerConnections";
import { useSignaling } from "./hooks/useSignaling";
import { useMessaging } from "./hooks/useMessaging";

export const Node: React.FC = () => {
  const [nodeId] = useState<string>(uuidv4());
  const [localSDP, setLocalSDP] = useState<string>("");
  const [remoteSDP, setRemoteSDP] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);
  const seenMessages = useRef<Set<string>>(new Set());

  const handleDataChannelMessage = (data: any, senderId: string) => {
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
      case "message":
        console.log("Received message", message);
        if (!seenMessages.current.has(message.messageId)) {
          seenMessages.current.add(message.messageId);
          setMessages((prev) => [
            ...prev,
            `From ${senderId}: ${message.content} (original sender: ${message.nodeId})`,
          ]);
          handleBroadcastToAllButSome(message, [senderId, message.nodeId]);
        }

        break;
      default:
        break;
    }
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
  } = usePeerConnections(nodeId, setMessages, handleDataChannelMessage);

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

  return (
    <div className="node">
      <h1>Node ID: {nodeId}</h1>

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
    </div>
  );
};
