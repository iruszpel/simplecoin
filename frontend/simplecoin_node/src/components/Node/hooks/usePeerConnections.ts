/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useCallback } from "react";
import {
  createPeerConnection,
  handleReceiveOffer,
  handleReceiveAnswer,
} from "./../peerConnectionHandler";
import { createDataChannel } from "./../dataChannelHandler";

export const usePeerConnections = (
  peerId: string,
  sendSignalMessage: React.MutableRefObject<(message: any) => void>,
  setMessages: React.Dispatch<React.SetStateAction<string[]>>,
  handleIncomingMessage: (data: string, senderId: string) => void,
  [knownPeers, setKnownPeers]: [
    Set<string>,
    React.Dispatch<React.SetStateAction<Set<string>>>
  ]
) => {
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());

  const connectToPeer = useCallback(
    async (targetId: string) => {
      if (dataChannels.current.has(targetId)) {
        console.log(`Already connected to ${targetId}`);
        return;
      }

      const localConnection = createPeerConnection(
        peerId,
        targetId,
        sendSignalMessage.current,
        setMessages,
        dataChannels,
        handleIncomingMessage,
        setKnownPeers
      );
      peerConnections.current.set(targetId, localConnection);

      const dataChannel = createDataChannel(
        localConnection,
        setMessages,
        targetId,
        dataChannels,
        handleIncomingMessage,
        peerConnections,
        setKnownPeers
      );

      const offer = await localConnection.createOffer();
      await localConnection.setLocalDescription(offer);

      sendSignalMessage.current({
        type: "offer",
        targetId,
        peerId,
        payload: offer,
      });
    },
    [
      peerId,
      sendSignalMessage,
      setMessages,
      handleIncomingMessage,
      setKnownPeers,
    ]
  );

  const handleReceiveOfferCallback = useCallback(
    async (remotePeerId: string, offer: RTCSessionDescriptionInit) => {
      const localConnection = createPeerConnection(
        peerId,
        remotePeerId,
        sendSignalMessage.current,
        setMessages,
        dataChannels,
        handleIncomingMessage,
        setKnownPeers
      );
      peerConnections.current.set(remotePeerId, localConnection);

      await handleReceiveOffer(
        remotePeerId,
        offer,
        localConnection,
        sendSignalMessage.current,
        peerId
      );
    },
    [
      peerId,
      sendSignalMessage,
      setMessages,
      handleIncomingMessage,
      setKnownPeers,
    ]
  );

  const handleReceiveAnswerCallback = useCallback(
    async (remotePeerId: string, answer: RTCSessionDescriptionInit) => {
      const connection = peerConnections.current.get(remotePeerId);
      if (connection) {
        await handleReceiveAnswer(remotePeerId, answer, peerConnections);
      } else {
        console.error(`No connection found for ${remotePeerId}`);
      }
    },
    [peerConnections]
  );

  return {
    peerConnections,
    dataChannels,
    connectToPeer,
    handleReceiveOfferCallback,
    handleReceiveAnswerCallback,
  };
};
