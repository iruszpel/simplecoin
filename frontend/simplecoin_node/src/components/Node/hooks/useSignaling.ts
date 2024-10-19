/* eslint-disable @typescript-eslint/no-explicit-any */

export const useSignaling = (
  nodeId: string,
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>,
  dataChannels: React.MutableRefObject<Map<string, RTCDataChannel>>,
  createPeerConnection: (remoteNodeId: string) => RTCPeerConnection,
  setupDataChannel: (remoteNodeId: string, channel: RTCDataChannel) => void,
  setLocalSDP: React.Dispatch<React.SetStateAction<string>>
) => {
  const waitForICEGatheringComplete = (
    pc: RTCPeerConnection
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", checkState);
      }
    });
  };

  const handleCreateOffer = async () => {
    const remoteNodeId = prompt("Enter remote node ID:");
    if (!remoteNodeId) return;

    const pc = createPeerConnection(remoteNodeId);
    const channel = pc.createDataChannel("chat" + remoteNodeId);
    setupDataChannel(remoteNodeId, channel);

    console.log("Creating offer for", remoteNodeId);
    const offer = await pc.createOffer();
    console.log("Setting local description");
    await pc.setLocalDescription(offer);
    console.log("Local description set");

    console.log("Awaiting ICE gathering completion");
    await waitForICEGatheringComplete(pc);
    console.log("ICE gathering complete");

    setLocalSDP(
      JSON.stringify({
        type: "offer",
        sdp: pc.localDescription,
        nodeId,
        targetId: remoteNodeId,
      })
    );
  };

  const handleSetRemoteDescription = async (remoteSDP: string) => {
    const message = JSON.parse(remoteSDP);
    const { type, sdp, nodeId: remoteNodeId } = message;

    let pc = peerConnections.current.get(remoteNodeId);
    if (!pc) {
      pc = createPeerConnection(remoteNodeId);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    if (type === "offer") {
      console.log("Received offer from", remoteNodeId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await waitForICEGatheringComplete(pc);

      setLocalSDP(
        JSON.stringify({
          type: "answer",
          sdp: pc.localDescription,
          nodeId,
          targetId: remoteNodeId,
        })
      );
    } else if (type === "answer") {
      console.log("Received answer from", remoteNodeId);
    }
  };

  const handleReceiveOffer = async (
    remoteNodeId: string,
    sdp: RTCSessionDescriptionInit
  ) => {
    let pc = peerConnections.current.get(remoteNodeId);
    if (!pc) {
      console.log("Creating peer connection for", remoteNodeId);
      pc = createPeerConnection(remoteNodeId);
      peerConnections.current.set(remoteNodeId, pc);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await waitForICEGatheringComplete(pc);

    const message = {
      type: "answer",
      sdp: pc.localDescription,
      nodeId,
      targetId: remoteNodeId,
    };

    console.log("Sending answer to", remoteNodeId);
    dataChannels.current.forEach((channel) => {
      if (channel.readyState === "open") {
        console.log("Sending answer via channel", channel.label);
        channel.send(JSON.stringify(message));
      }
    });
  };

  const handleReceiveAnswer = async (
    remoteNodeId: string,
    sdp: RTCSessionDescriptionInit
  ) => {
    const pc = peerConnections.current.get(remoteNodeId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } else {
      console.error("Peer connection not found for", remoteNodeId);
    }
  };

  const handleSignalingMessage = async (message: any) => {
    const { type, sdp, targetId, nodeId: senderNodeId } = message;
    console.log("Received signaling message:", message);
    if (targetId && targetId !== nodeId) {
      const channel = dataChannels.current.get(targetId);
      if (channel && channel.readyState === "open") {
        console.log("Forwarding message to", targetId);
        channel.send(JSON.stringify(message));
      }
      return;
    }
    if (type === "offer") {
      console.log("Received offer from", senderNodeId);
      await handleReceiveOffer(senderNodeId, sdp);
    } else if (type === "answer") {
      console.log("Received answer from", senderNodeId);
      await handleReceiveAnswer(senderNodeId, sdp);
    }
  };

  const handleConnectToPeer = async (remoteNodeId: string) => {
    let channel = dataChannels.current.get(remoteNodeId);
    if (channel && channel.readyState === "open") {
      console.log("Already connected to", remoteNodeId);
      return;
    }

    const pc = createPeerConnection(remoteNodeId);

    channel = pc.createDataChannel("chat" + remoteNodeId);
    setupDataChannel(remoteNodeId, channel);

    console.log("Creating offer for", remoteNodeId);
    const offer = await pc.createOffer();
    console.log("Setting local description");
    await pc.setLocalDescription(offer);
    console.log("Local description set");

    console.log("Awaiting ICE gathering completion");
    await waitForICEGatheringComplete(pc);
    console.log("ICE gathering complete");

    const message = {
      type: "offer",
      sdp: pc.localDescription,
      nodeId,
      targetId: remoteNodeId,
    };

    console.log("Sending offer to", remoteNodeId);
    dataChannels.current.forEach((channel) => {
      if (channel.readyState === "open") {
        console.log("Sent offer to", remoteNodeId, "via", channel.label);
        channel.send(JSON.stringify(message));
      }
    });
  };

  return {
    handleCreateOffer,
    handleSetRemoteDescription,
    handleSignalingMessage,
    handleConnectToPeer,
  };
};
