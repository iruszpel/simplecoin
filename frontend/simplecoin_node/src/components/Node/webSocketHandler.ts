import WebSocket from "isomorphic-ws";

export const initializeWebSocket = (
  peerId: string,
  handleReceiveOffer: (
    remotePeerId: string,
    offer: RTCSessionDescriptionInit
  ) => Promise<void>,
  handleReceiveAnswer: (
    remotePeerId: string,
    answer: RTCSessionDescriptionInit,
    peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>
  ) => Promise<void>,
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>
) => {
  const ws = new WebSocket("ws://localhost:8080");

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "register", peerId }));
    console.log("Connected to signaling server");
  };

  ws.onmessage = async (message: { data: string }) => {
    const data = JSON.parse(message.data);
    const { type, peerId: remotePeerId, payload } = data;

    switch (type) {
      case "offer":
        await handleReceiveOffer(remotePeerId, payload);
        break;
      case "answer":
        await handleReceiveAnswer(remotePeerId, payload, peerConnections);
        break;
      case "candidate":
        if (payload) {
          const connection = peerConnections.current.get(remotePeerId);
          if (connection) {
            await connection.addIceCandidate(new RTCIceCandidate(payload));
          }
        }
        break;
      default:
        break;
    }
  };

  return ws;
};
