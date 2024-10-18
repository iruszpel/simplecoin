/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useWebSocket } from "./hooks/useWebSocket";
import { usePeerConnections } from "./hooks/usePeerConnections";
import { v4 as uuidv4 } from "uuid";

type PendingAck = {
  attempts: number;
  targetId: string;
};

const MAX_RETRIES = 2;

export const Node: React.FC = () => {
  const [peerId, setPeerId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);
  const [knownPeers, setKnownPeers] = useState<Set<string>>(new Set());
  const seenMessages = useRef<Set<string>>(new Set());
  const pendingAcks = useRef<Map<string, PendingAck[]>>(new Map());

  useEffect(() => {
    const id = Math.random().toString(36).substr(2, 9);
    setPeerId(id);
  }, []);

  const ws = useRef<WebSocket | null>(null);

  const handleIncomingMessage = (data: string, senderId: string) => {
    const messageData = JSON.parse(data);

    if (messageData.type === "peer-list") {
      const newPeers = messageData.payload.filter(
        (id: string) => id !== peerId
      );
      setKnownPeers((prevKnownPeers) => {
        const updatedKnownPeers = new Set(prevKnownPeers);
        newPeers.forEach((id: string) => updatedKnownPeers.add(id));
        return updatedKnownPeers;
      });
    } else if (messageData.type === "message") {
      const { id, sender, content } = messageData;

      if (seenMessages.current.has(id)) {
        const ackMessage = JSON.stringify({
          type: "ack",
          messageId: messageData.id,
          sender: peerId,
        });
        const senderChannel = dataChannels.current.get(senderId);
        if (senderChannel && senderChannel.readyState === "open") {
          senderChannel.send(ackMessage);
        }
        return;
      }

      seenMessages.current.add(id);
      setMessages((prev) => [...prev, `From ${sender}: ${content}`]);

      dataChannels.current.forEach((channel, targetId) => {
        if (targetId !== senderId && channel.readyState === "open") {
          channel.send(data);
          setMessages((prev) => [
            ...prev,
            `Forwarded to ${targetId}: ${content}`,
          ]);
        }
      });

      const ackMessage = JSON.stringify({
        type: "ack",
        messageId: messageData.id,
        sender: peerId,
      });
      const senderChannel = dataChannels.current.get(senderId);
      if (senderChannel && senderChannel.readyState === "open") {
        senderChannel.send(ackMessage);
      }
    } else if (messageData.type === "ack") {
      const { messageId, sender } = messageData;
      const pendingAckList = pendingAcks.current.get(messageId);
      if (pendingAckList) {
        pendingAcks.current.set(
          messageId,
          pendingAckList.filter((ack) => ack.targetId !== sender)
        );

        if (pendingAcks.current.get(messageId)?.length === 0) {
          pendingAcks.current.delete(messageId);
          setMessages((prev) => [
            ...prev,
            `Message ${messageId} delivered successfully`,
          ]);
        }
      }
    }
  };

  const sendSignalMessage = useRef<(message: any) => void>(() => {});

  const {
    peerConnections,
    dataChannels,
    connectToPeer,
    handleReceiveOfferCallback,
    handleReceiveAnswerCallback,
  } = usePeerConnections(
    peerId,
    sendSignalMessage,
    setMessages,
    handleIncomingMessage,
    [knownPeers, setKnownPeers]
  );

  useWebSocket(
    peerId,
    handleReceiveOfferCallback,
    handleReceiveAnswerCallback,
    peerConnections,
    sendSignalMessage
  );

  // const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // useEffect(() => {
  //   intervalRef.current = setInterval(() => {
  //     const peerListMessage = JSON.stringify({
  //       type: "peer-list",
  //       payload: Array.from(knownPeers),
  //     });

  //     console.log(dataChannels.current);

  //     dataChannels.current.forEach((channel) => {
  //       if (channel.readyState === "open") {
  //         channel.send(peerListMessage);
  //         console.log(
  //           "Sent peer list to all known peers",
  //           Array.from(knownPeers)
  //         );
  //       }
  //     });

  //     return () => {
  //       if (intervalRef.current) {
  //         clearInterval(intervalRef.current);
  //       }
  //     };
  //   }, 5000);
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  function tryAlternativePeers(
    messageId: string,
    fullMessage: string,
    failedTargetId: string
  ) {
    const alternativePeers = Array.from(dataChannels.current.keys()).filter(
      (id) => id !== failedTargetId && id !== peerId
    );

    console.log("Alternative peers", alternativePeers);

    console.log("dataChannels", dataChannels.current);

    alternativePeers.forEach((targetId) => {
      const channel = dataChannels.current.get(targetId);
      if (channel && channel.readyState === "open") {
        const pendingAckList = pendingAcks.current.get(messageId) || [];
        if (pendingAckList.some((ack) => ack.targetId === targetId)) {
          return;
        }

        channel.send(fullMessage);
        setMessages((prev) => [
          ...prev,
          `Sent to alternative peer ${targetId}: ${
            JSON.parse(fullMessage).content
          }`,
        ]);

        const newPendingAck: PendingAck = { attempts: 1, targetId };
        if (!pendingAcks.current.has(messageId)) {
          pendingAcks.current.set(messageId, [newPendingAck]);
        } else {
          pendingAcks.current.get(messageId)?.push(newPendingAck);
        }

        startAckTimer(messageId, targetId, channel, fullMessage);
      }
    });

    if (!pendingAcks.current.get(messageId)?.length) {
      setMessages((prev) => [
        ...prev,
        `No alternative peers available to deliver message ${messageId}`,
      ]);
      pendingAcks.current.delete(messageId);
    }
  }

  function startAckTimer(
    messageId: string,
    targetId: string,
    channel: RTCDataChannel,
    fullMessage: string
  ) {
    setTimeout(() => {
      const pendingAckList = pendingAcks.current.get(messageId);
      const pendingAck = pendingAckList?.find(
        (ack) => ack.targetId === targetId
      );

      if (pendingAck && pendingAck.attempts < MAX_RETRIES) {
        if (channel.readyState === "open") {
          channel.send(fullMessage);
          setMessages((prev) => [
            ...prev,
            `Retransmitted to ${targetId}: ${JSON.parse(fullMessage).content}`,
          ]);

          pendingAck.attempts += 1;

          startAckTimer(messageId, targetId, channel, fullMessage);
        }
      } else if (pendingAck) {
        setMessages((prev) => [
          ...prev,
          `Peer ${targetId} is unresponsive. Removing from known peers.`,
        ]);
        dataChannels.current.delete(targetId);
        peerConnections.current.delete(targetId);
        setKnownPeers((prev) => {
          const updatedPeers = new Set(prev);
          updatedPeers.delete(targetId);
          return updatedPeers;
        });

        setMessages((prev) => [
          ...prev,
          `Failed to deliver to ${targetId} after ${MAX_RETRIES} attempts`,
        ]);
        pendingAcks.current
          .get(messageId)
          ?.splice(
            pendingAcks.current.get(messageId)?.indexOf(pendingAck) || 0,
            1
          );

        tryAlternativePeers(messageId, fullMessage, targetId);
      }
    }, 5000);
  }

  function sendMessage(message: string) {
    const messageId = uuidv4();
    const fullMessage = JSON.stringify({
      type: "message",
      id: messageId,
      sender: peerId,
      content: message,
    });

    seenMessages.current.add(messageId);
    const initialPendingAcks: PendingAck[] = [];

    dataChannels.current.forEach((channel, targetId) => {
      if (channel.readyState === "open") {
        channel.send(fullMessage);
        setMessages((prev) => [...prev, `Sent to ${targetId}: ${message}`]);
        initialPendingAcks.push({ attempts: 1, targetId });

        startAckTimer(messageId, targetId, channel, fullMessage);
      }
    });

    pendingAcks.current.set(messageId, initialPendingAcks);
  }

  return (
    <div className="node">
      <h1>Node</h1>
      <p>Your Peer ID: {peerId}</p>

      <div>
        <h2>Connect to Peer</h2>
        <Input
          type="text"
          placeholder="Enter target peer ID"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        />
        <Button onClick={() => connectToPeer(targetId)}>Connect</Button>
      </div>

      <div>
        <h2>Known Peers</h2>
        <ul>
          {Array.from(knownPeers).map((id) => (
            <li key={id}>
              {id}{" "}
              {!peerConnections.current.has(id) && id !== peerId && (
                <Button onClick={() => connectToPeer(id)}>Connect</Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Button onClick={() => sendMessage("Hello from " + peerId)}>
        Send Broadcast Message
      </Button>

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
