/* eslint-disable @typescript-eslint/no-explicit-any */
export const createPeerConnection = (
  peerId: string,
  remotePeerId: string,
  sendSignalMessage: (message: any) => void,
  setMessages: React.Dispatch<React.SetStateAction<string[]>>,
  dataChannels: React.MutableRefObject<Map<string, RTCDataChannel>>,
  handleIncomingMessage: (data: string, senderId: string) => void,
  setKnownPeers: React.Dispatch<React.SetStateAction<Set<string>>>
) => {
  const localConnection = new RTCPeerConnection();

  localConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignalMessage({
        type: "candidate",
        targetId: remotePeerId,
        peerId,
        payload: event.candidate,
      });
    }
  };

  localConnection.ondatachannel = (event) => {
    const channel = event.channel;

    channel.onopen = () => {
      console.log("Data channel is open with", remotePeerId);
      setMessages((prev) => [
        ...prev,
        `Data channel open with ${remotePeerId}`,
      ]);
      setKnownPeers((prev) => new Set([...prev, remotePeerId]));
      dataChannels.current.set(remotePeerId, channel);

      const peerListMessage = JSON.stringify({
        type: "peer-list",
        payload: Array.from(dataChannels.current.keys()),
      });
      channel.send(peerListMessage);
    };

    channel.onmessage = (event) => {
      handleIncomingMessage(event.data, remotePeerId);
    };
  };

  return localConnection;
};

export const handleReceiveOffer = async (
  remotePeerId: string,
  offer: RTCSessionDescriptionInit,
  localConnection: RTCPeerConnection,
  sendSignalMessage: (message: any) => void,
  peerId: string
) => {
  await localConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await localConnection.createAnswer();
  await localConnection.setLocalDescription(answer);

  sendSignalMessage({
    type: "answer",
    targetId: remotePeerId,
    peerId,
    payload: answer,
  });
};

export const handleReceiveAnswer = async (
  remotePeerId: string,
  answer: RTCSessionDescriptionInit,
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>
) => {
  const connection = peerConnections.current.get(remotePeerId);
  if (connection) {
    await connection.setRemoteDescription(new RTCSessionDescription(answer));
  }
};
