export const createDataChannel = (
  localConnection: RTCPeerConnection,
  setMessages: React.Dispatch<React.SetStateAction<string[]>>,
  remotePeerId: string,
  dataChannels: React.MutableRefObject<Map<string, RTCDataChannel>>,
  handleIncomingMessage: (data: string, senderId: string) => void,
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>,
  setKnownPeers: React.Dispatch<React.SetStateAction<Set<string>>>
) => {
  const dataChannel = localConnection.createDataChannel("nodeDataChannel");

  dataChannel.onopen = () => {
    console.log("Data channel is open with", remotePeerId);
    setMessages((prev) => [...prev, `Data channel open with ${remotePeerId}`]);
    setKnownPeers((prev) => new Set([...prev, remotePeerId]));
    dataChannels.current.set(remotePeerId, dataChannel);

    const peerListMessage = JSON.stringify({
      type: "peer-list",
      payload: Array.from(dataChannels.current.keys()),
    });
    dataChannel.send(peerListMessage);
  };

  dataChannel.onmessage = (event) => {
    handleIncomingMessage(event.data, remotePeerId);
  };

  dataChannel.onclose = () => {
    console.log(`Data channel closed with ${remotePeerId}`);
    setMessages((prev) => [...prev, `Connection lost with ${remotePeerId}`]);
    dataChannels.current.delete(remotePeerId);
    peerConnections.current.delete(remotePeerId);
    setKnownPeers((prev) => {
      const updatedPeers = new Set(prev);
      updatedPeers.delete(remotePeerId);
      return updatedPeers;
    });
  };

  dataChannel.onerror = (error) => {
    console.error(`Data channel error with ${remotePeerId}:`, error);
    // Handle error as needed
  };

  return dataChannel;
};
