import WebSocket, { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

interface Peer {
  [key: string]: WebSocket;
}

interface Message {
  type: string;
  peerId: string;
  targetId?: string;
  payload?: any;
}

const peers: Peer = {};

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (message: string) => {
    let data: Message;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error("Invalid JSON", e);
      return;
    }

    const { type, peerId, targetId, payload } = data;

    switch (type) {
      case "register":
        peers[peerId] = ws;
        (ws as any).peerId = peerId;
        console.log(`Peer registered: ${peerId}`);
        break;
      case "offer":
      case "answer":
      case "candidate":
        if (targetId && peers[targetId]) {
          peers[targetId].send(JSON.stringify({ type, peerId, payload }));
        }
        break;
      default:
        console.error("Unknown message type:", type);
    }
  });

  ws.on("close", () => {
    const peerId = (ws as any).peerId;
    if (peerId) {
      delete peers[peerId];
      console.log(`Peer disconnected: ${peerId}`);
    }
  });
});

console.log("Signaling server is running on ws://localhost:8080");
