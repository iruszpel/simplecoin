/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";

export const useMessaging = (
  nodeId: string,
  dataChannels: React.MutableRefObject<Map<string, RTCDataChannel>>,
  setMessages: React.Dispatch<React.SetStateAction<string[]>>
) => {
  const [messageToSend, setMessageToSend] = useState<string>("");

  const handleBroadcastMessage = () => {
    const messageId = window.crypto.randomUUID();
    dataChannels.current.forEach((channel) => {
      if (channel.readyState === "open") {
        const message = {
          type: "message",
          messageType: "text",
          content: messageToSend,
          messageId: messageId,
          nodeId,
        };
        channel.send(JSON.stringify(message));
      }
    });
    setMessages((prev) => [
      ...prev,
      `Broadcast: ${messageToSend} to all connected peers`,
    ]);
    setMessageToSend("");
  };

  const handleBroadcastToAllButSome = (message: any, senderIds: string[]) => {
    dataChannels.current.forEach((channel, id) => {
      if (
        channel.readyState === "open" &&
        !senderIds.includes(id) &&
        !senderIds.includes(nodeId)
      ) {
        console.log("Broadcasting message to", id);
        channel.send(JSON.stringify(message));
      }
    });
  };

  return {
    messageToSend,
    setMessageToSend,
    handleBroadcastMessage,
    handleBroadcastToAllButSome,
  };
};
