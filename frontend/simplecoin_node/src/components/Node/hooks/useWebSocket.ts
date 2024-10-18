/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import useWebSocketHook from "react-use-websocket";

export const useWebSocket = (
  peerId: string,
  handleReceiveOfferCallback: (
    remotePeerId: string,
    offer: RTCSessionDescriptionInit
  ) => Promise<void>,
  handleReceiveAnswerCallback: (
    remotePeerId: string,
    answer: RTCSessionDescriptionInit
  ) => Promise<void>,
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>,
  sendSignalMessage: React.MutableRefObject<(message: any) => void>
) => {
  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocketHook(
    "ws://localhost:8080",
    {
      onOpen: () => {
        sendJsonMessage({ type: "register", peerId });
        console.log("Connected to signaling server");
      },
    }
  );

  useEffect(() => {
    if (lastJsonMessage !== null) {
      const data = lastJsonMessage;
      const { type, peerId: remotePeerId, payload } = data as any;

      switch (type) {
        case "offer":
          handleReceiveOfferCallback(remotePeerId, payload);
          break;
        case "answer":
          handleReceiveAnswerCallback(remotePeerId, payload);
          break;
        case "candidate":
          if (payload) {
            const connection = peerConnections.current.get(remotePeerId);
            if (connection) {
              connection.addIceCandidate(new RTCIceCandidate(payload));
            }
          }
          break;
        default:
          break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJsonMessage]);

  useEffect(() => {
    sendSignalMessage.current = sendJsonMessage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendJsonMessage]);
};
