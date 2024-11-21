/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";

export const usePeerConnections = (
  nodeId: string,
  setMessages: React.Dispatch<React.SetStateAction<string[]>>,
  handleDataChannelMessage: (data: any, senderId: string) => void,
  onDataChannelOpen: (remoteNodeId: string, channel: RTCDataChannel) => void
) => {
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const [knownPeers, setKnownPeers] = useState<
    Map<string, RTCDataChannel | null>
  >(new Map());
  const [openChannelNodeIds, setOpenChannelNodeIds] = useState<string[]>([]);

  const createPeerConnection = (remoteNodeId: string) => {
    const pc = new RTCPeerConnection({ iceServers: [] });

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      setupDataChannel(remoteNodeId, channel);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("ICE candidate:", event.candidate);
      } else {
        console.log("ICE gathering complete for", remoteNodeId);
      }
    };

    peerConnections.current.set(remoteNodeId, pc);
    return pc;
  };

  const setupDataChannel = (remoteNodeId: string, channel: RTCDataChannel) => {
    dataChannels.current.set(remoteNodeId, channel);
    setKnownPeers((prev) => new Map(prev.set(remoteNodeId, channel)));

    channel.onopen = () => {
      console.log("Data channel is open with", remoteNodeId);
      setMessages((prev) => [
        ...prev,
        `Data channel open with ${remoteNodeId}`,
      ]);

      setOpenChannelNodeIds((prev) => [...prev, remoteNodeId]);

      const peerListMessage = {
        type: "peer-list",
        peers: Array.from(dataChannels.current.keys()),
      };
      channel.send(JSON.stringify(peerListMessage));

      onDataChannelOpen(remoteNodeId, channel);
    };

    channel.onmessage = (event) => {
      handleDataChannelMessage(event.data, remoteNodeId);
    };

    channel.onclose = () => {
      console.log(`Data channel with ${remoteNodeId} closed`);
      setMessages((prev) => [
        ...prev,
        `Data channel with ${remoteNodeId} closed`,
      ]);
      setOpenChannelNodeIds((prev) =>
        prev.filter((id: string) => id !== remoteNodeId)
      );
      dataChannels.current.delete(remoteNodeId);
      setKnownPeers((prev) => {
        const newMap = new Map(prev);
        newMap.delete(remoteNodeId);
        return newMap;
      });
    };
  };

  return {
    peerConnections,
    dataChannels,
    knownPeers,
    openChannelNodeIds,
    createPeerConnection,
    setupDataChannel,
    setKnownPeers,
    setOpenChannelNodeIds,
  };
};
