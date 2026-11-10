import { useCallback, useEffect, useRef, useState } from "react";
import { socketService } from "../services/socket.service";
import { useToast } from "./useToast";
import type {
  EphemeralChatMessage,
  MeetingCategory,
  MeetingMediaState,
  MeetingRoom,
} from "../types/socket";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export interface ActiveReaction {
  emoji: string;
  timestamp: number;
}

export function useWebRTCMeeting() {
  const toast = useToast();
  const showToast = useCallback(
    (message: string, type: "info" | "warning" | "error" | "success" = "info") => {
      toast[type]({ title: message });
    },
    [toast],
  );

  const [lobbyRooms, setLobbyRooms] = useState<MeetingRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<MeetingRoom | null>(null);
  const [selfSocketId, setSelfSocketId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<EphemeralChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [reactions, setReactions] = useState<Record<string, ActiveReaction>>({});

  const [mediaState, setMediaState] = useState<MeetingMediaState>({
    isMuted: false,
    isCameraOn: false,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
  });

  const activeRoomRef = useRef<MeetingRoom | null>(null);
  const isChatOpenRef = useRef<boolean>(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Audio analyser for speaking indicator
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const mediaStateRef = useRef<MeetingMediaState>(mediaState);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    if (isChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isChatOpen]);

  useEffect(() => {
    mediaStateRef.current = mediaState;
  }, [mediaState]);

  const stopSpeakingDetector = useCallback(() => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    isSpeakingRef.current = false;
  }, []);

  const startSpeakingDetector = useCallback(
    (audioTrack: MediaStreamTrack) => {
      stopSpeakingDetector();
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        audioContextRef.current = ctx;

        speakingIntervalRef.current = setInterval(() => {
          if (!audioTrack.enabled || mediaStateRef.current.isMuted) {
            if (isSpeakingRef.current) {
              isSpeakingRef.current = false;
              setMediaState((prev) => ({ ...prev, isSpeaking: false }));
              if (activeRoomRef.current) {
                socketService.emit("meeting:media-state", {
                  roomId: activeRoomRef.current.id,
                  patch: { isSpeaking: false },
                });
              }
            }
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const nowSpeaking = avg > 18;

          if (nowSpeaking !== isSpeakingRef.current) {
            isSpeakingRef.current = nowSpeaking;
            setMediaState((prev) => ({ ...prev, isSpeaking: nowSpeaking }));
            if (activeRoomRef.current) {
              socketService.emit("meeting:media-state", {
                roomId: activeRoomRef.current.id,
                patch: { isSpeaking: nowSpeaking },
              });
            }
          }
        }, 250);
      } catch {
        // Ignore audio context errors on restricted browsers
      }
    },
    [stopSpeakingDetector],
  );

  const cleanupMediaAndPeers = useCallback(() => {
    stopSpeakingDetector();

    for (const pc of peerConnectionsRef.current.values()) {
      try {
        pc.close();
      } catch {}
    }
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams({});
    setReactions({});
    setMediaState({
      isMuted: false,
      isCameraOn: false,
      isScreenSharing: false,
      isHandRaised: false,
      isSpeaking: false,
    });
  }, [stopSpeakingDetector]);

  const rebuildLocalPreviewStream = useCallback(() => {
    const tracks: MediaStreamTrack[] = [];
    if (audioTrackRef.current) {
      tracks.push(audioTrackRef.current);
    }
    if (screenTrackRef.current) {
      tracks.push(screenTrackRef.current);
    } else if (cameraTrackRef.current) {
      tracks.push(cameraTrackRef.current);
    }
    const nextStream = new MediaStream(tracks);
    localStreamRef.current = nextStream;
    setLocalStream(nextStream);
    return nextStream;
  }, []);

  const createPeerConnection = useCallback(
    (targetSocketId: string, roomId: string): RTCPeerConnection => {
      const existing = peerConnectionsRef.current.get(targetSocketId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current.set(targetSocketId, pc);

      // Attach current local tracks
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketService.emit("meeting:webrtc-ice", {
            roomId,
            targetSocketId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          setRemoteStreams((prev) => ({
            ...prev,
            [targetSocketId]: remoteStream,
          }));
        } else {
          setRemoteStreams((prev) => {
            const current = prev[targetSocketId] || new MediaStream();
            current.addTrack(event.track);
            return { ...prev, [targetSocketId]: new MediaStream(current.getTracks()) };
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          setRemoteStreams((prev) => {
            const copy = { ...prev };
            delete copy[targetSocketId];
            return copy;
          });
        }
      };

      return pc;
    },
    [],
  );

  const syncVideoTrackToPeers = useCallback(
    async (newVideoTrack: MediaStreamTrack | null) => {
      const currentRoom = activeRoomRef.current;
      if (!currentRoom) return;

      const stream = rebuildLocalPreviewStream();

      for (const [targetSocketId, pc] of peerConnectionsRef.current.entries()) {
        try {
          const videoSender = pc
            .getSenders()
            .find((s) => s.track?.kind === "video");

          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
          } else if (newVideoTrack) {
            pc.addTrack(newVideoTrack, stream);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketService.emit("meeting:webrtc-offer", {
              roomId: currentRoom.id,
              targetSocketId,
              sdp: offer,
            });
          }
        } catch (err) {
          console.error("Failed to sync video track to peer:", err);
        }
      }
    },
    [rebuildLocalPreviewStream],
  );

  // Acquire initial audio (voice-first by default)
  const prepareInitialAudio = useCallback(
    async (startMuted: boolean, startWithVideo: boolean) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: startWithVideo
            ? { width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
        });

        const audioTrack = stream.getAudioTracks()[0] || null;
        const videoTrack = stream.getVideoTracks()[0] || null;

        if (audioTrack) {
          audioTrack.enabled = !startMuted;
          audioTrackRef.current = audioTrack;
          startSpeakingDetector(audioTrack);
        }
        if (videoTrack) {
          cameraTrackRef.current = videoTrack;
        }

        rebuildLocalPreviewStream();

        const initial: MeetingMediaState = {
          isMuted: audioTrack ? startMuted : true,
          isCameraOn: Boolean(videoTrack),
          isScreenSharing: false,
          isHandRaised: false,
          isSpeaking: false,
        };
        setMediaState(initial);
        return initial;
      } catch {
        // Fallback if only audio works or no hardware device is available
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          const audioTrack = audioOnly.getAudioTracks()[0] || null;
          if (audioTrack) {
            audioTrack.enabled = !startMuted;
            audioTrackRef.current = audioTrack;
            startSpeakingDetector(audioTrack);
          }
          rebuildLocalPreviewStream();
          const initial: MeetingMediaState = {
            isMuted: audioTrack ? startMuted : true,
            isCameraOn: false,
            isScreenSharing: false,
            isHandRaised: false,
            isSpeaking: false,
          };
          setMediaState(initial);
          return initial;
        } catch {
          showToast(
            "Joined in listener mode (microphone/camera not detected or blocked).",
            "info",
          );
          const fallback: MeetingMediaState = {
            isMuted: true,
            isCameraOn: false,
            isScreenSharing: false,
            isHandRaised: false,
            isSpeaking: false,
          };
          setMediaState(fallback);
          return fallback;
        }
      }
    },
    [rebuildLocalPreviewStream, showToast, startSpeakingDetector],
  );

  // Socket event bindings
  useEffect(() => {
    const handleLobbySync = (data: { rooms: MeetingRoom[] }) => {
      setLobbyRooms(data.rooms);
    };

    const handleJoined = (data: {
      room: MeetingRoom;
      selfSocketId: string;
      chatHistory: EphemeralChatMessage[];
    }) => {
      setActiveRoom(data.room);
      setSelfSocketId(data.selfSocketId);
      setChatMessages(data.chatHistory);
      setUnreadChatCount(0);
    };

    const handleUserJoined = async (data: {
      roomId: string;
      participant: { socketId: string; fullName: string };
      room: MeetingRoom;
    }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      setActiveRoom(data.room);

      // Existing participant initiates WebRTC offer to the newcomer
      try {
        const pc = createPeerConnection(data.participant.socketId, data.roomId);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        socketService.emit("meeting:webrtc-offer", {
          roomId: data.roomId,
          targetSocketId: data.participant.socketId,
          sdp: offer,
        });
      } catch (err) {
        console.error("Failed to create WebRTC offer:", err);
      }
    };

    const handleUserLeft = (data: {
      roomId: string;
      socketId: string;
      userId: string;
      room: MeetingRoom;
    }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      setActiveRoom(data.room);

      const pc = peerConnectionsRef.current.get(data.socketId);
      if (pc) {
        try {
          pc.close();
        } catch {}
        peerConnectionsRef.current.delete(data.socketId);
      }
      pendingCandidatesRef.current.delete(data.socketId);
      setRemoteStreams((prev) => {
        const copy = { ...prev };
        delete copy[data.socketId];
        return copy;
      });
    };

    const handleRoomUpdated = (data: { room: MeetingRoom }) => {
      if (activeRoomRef.current?.id === data.room.id) {
        setActiveRoom(data.room);
      }
    };

    const handleParticipantUpdated = (data: {
      roomId: string;
      room: MeetingRoom;
    }) => {
      if (activeRoomRef.current?.id === data.roomId) {
        setActiveRoom(data.room);
      }
    };

    const handleMeetingEnded = (data: {
      roomId: string;
      reason: "host_ended" | "idle_timeout";
      endedBy: string;
    }) => {
      if (activeRoomRef.current?.id === data.roomId) {
        cleanupMediaAndPeers();
        setActiveRoom(null);
        setChatMessages([]);
        setIsChatOpen(false);
        showToast(
          data.reason === "idle_timeout"
            ? "Meeting room closed automatically due to inactivity."
            : `Meeting ended by ${data.endedBy}. Temporary chat has been erased.`,
          "info",
        );
      }
    };

    const handleForceMuted = (data: { roomId: string; mutedBy: string }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = false;
      }
      setMediaState((prev) => ({ ...prev, isMuted: true, isSpeaking: false }));
      showToast(`Your microphone was muted by ${data.mutedBy}.`, "warning");
    };

    const handleKicked = (data: { roomId: string; kickedBy: string }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      cleanupMediaAndPeers();
      setActiveRoom(null);
      setChatMessages([]);
      setIsChatOpen(false);
      showToast(`You were removed from the meeting by ${data.kickedBy}.`, "error");
    };

    const handleChatNew = (msg: EphemeralChatMessage) => {
      if (activeRoomRef.current?.id !== msg.roomId) return;
      setChatMessages((prev) => [...prev, msg]);
      if (!isChatOpenRef.current && msg.type === "text") {
        setUnreadChatCount((c) => c + 1);
      }
    };

    const handleReaction = (data: {
      roomId: string;
      socketId: string;
      emoji: string;
    }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      const timestamp = Date.now();
      setReactions((prev) => ({
        ...prev,
        [data.socketId]: { emoji: data.emoji, timestamp },
      }));
      setTimeout(() => {
        setReactions((prev) => {
          if (prev[data.socketId]?.timestamp !== timestamp) return prev;
          const copy = { ...prev };
          delete copy[data.socketId];
          return copy;
        });
      }, 3000);
    };

    const handleError = (data: { message: string }) => {
      showToast(data.message, "error");
    };

    const handleWebRTCOffer = async (data: {
      roomId: string;
      fromSocketId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      try {
        const pc = createPeerConnection(data.fromSocketId, data.roomId);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        const queued = pendingCandidatesRef.current.get(data.fromSocketId) || [];
        for (const cand of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
        pendingCandidatesRef.current.delete(data.fromSocketId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketService.emit("meeting:webrtc-answer", {
          roomId: data.roomId,
          targetSocketId: data.fromSocketId,
          sdp: answer,
        });
      } catch (err) {
        console.error("Error handling WebRTC offer:", err);
      }
    };

    const handleWebRTCAnswer = async (data: {
      roomId: string;
      fromSocketId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      try {
        const pc = peerConnectionsRef.current.get(data.fromSocketId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        const queued = pendingCandidatesRef.current.get(data.fromSocketId) || [];
        for (const cand of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
        pendingCandidatesRef.current.delete(data.fromSocketId);
      } catch (err) {
        console.error("Error handling WebRTC answer:", err);
      }
    };

    const handleWebRTCIce = async (data: {
      roomId: string;
      fromSocketId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (activeRoomRef.current?.id !== data.roomId) return;
      try {
        const pc = peerConnectionsRef.current.get(data.fromSocketId);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          const existing =
            pendingCandidatesRef.current.get(data.fromSocketId) || [];
          existing.push(data.candidate);
          pendingCandidatesRef.current.set(data.fromSocketId, existing);
        }
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    };

    socketService.on("meeting:lobby-sync", handleLobbySync);
    socketService.on("meeting:joined", handleJoined);
    socketService.on("meeting:user-joined", handleUserJoined);
    socketService.on("meeting:user-left", handleUserLeft);
    socketService.on("meeting:room-updated", handleRoomUpdated);
    socketService.on("meeting:participant-updated", handleParticipantUpdated);
    socketService.on("meeting:ended", handleMeetingEnded);
    socketService.on("meeting:force-muted", handleForceMuted);
    socketService.on("meeting:kicked", handleKicked);
    socketService.on("meeting:chat-new", handleChatNew);
    socketService.on("meeting:reaction", handleReaction);
    socketService.on("meeting:error", handleError);
    socketService.on("meeting:webrtc-offer", handleWebRTCOffer);
    socketService.on("meeting:webrtc-answer", handleWebRTCAnswer);
    socketService.on("meeting:webrtc-ice", handleWebRTCIce);

    // Fetch initial lobby rooms
    socketService.emit("meeting:list");

    return () => {
      if (activeRoomRef.current) {
        socketService.emit("meeting:leave", {
          roomId: activeRoomRef.current.id,
        });
      }
      cleanupMediaAndPeers();

      socketService.off("meeting:lobby-sync", handleLobbySync);
      socketService.off("meeting:joined", handleJoined);
      socketService.off("meeting:user-joined", handleUserJoined);
      socketService.off("meeting:user-left", handleUserLeft);
      socketService.off("meeting:room-updated", handleRoomUpdated);
      socketService.off("meeting:participant-updated", handleParticipantUpdated);
      socketService.off("meeting:ended", handleMeetingEnded);
      socketService.off("meeting:force-muted", handleForceMuted);
      socketService.off("meeting:kicked", handleKicked);
      socketService.off("meeting:chat-new", handleChatNew);
      socketService.off("meeting:reaction", handleReaction);
      socketService.off("meeting:error", handleError);
      socketService.off("meeting:webrtc-offer", handleWebRTCOffer);
      socketService.off("meeting:webrtc-answer", handleWebRTCAnswer);
      socketService.off("meeting:webrtc-ice", handleWebRTCIce);
    };
  }, [cleanupMediaAndPeers, createPeerConnection, showToast]);

  const createRoom = useCallback(
    async (params: {
      name: string;
      category: MeetingCategory;
      centerId?: string | null;
      centerName?: string | null;
      startWithVideo?: boolean;
    }) => {
      const initialMedia = await prepareInitialAudio(
        false,
        Boolean(params.startWithVideo),
      );
      socketService.emit("meeting:create", {
        name: params.name,
        category: params.category,
        centerId: params.centerId || null,
        centerName: params.centerName || null,
        initialMedia,
      });
    },
    [prepareInitialAudio],
  );

  const joinRoom = useCallback(
    async (roomId: string, startWithVideo = false) => {
      const initialMedia = await prepareInitialAudio(false, startWithVideo);
      socketService.emit("meeting:join", {
        roomId,
        initialMedia,
      });
    },
    [prepareInitialAudio],
  );

  const leaveRoom = useCallback(() => {
    if (!activeRoomRef.current) return;
    socketService.emit("meeting:leave", { roomId: activeRoomRef.current.id });
    cleanupMediaAndPeers();
    setActiveRoom(null);
    setChatMessages([]);
    setIsChatOpen(false);
  }, [cleanupMediaAndPeers]);

  const endMeeting = useCallback(() => {
    if (!activeRoomRef.current) return;
    socketService.emit("meeting:end", { roomId: activeRoomRef.current.id });
  }, []);

  const toggleMute = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room) return;

    if (!audioTrackRef.current) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        const track = s.getAudioTracks()[0];
        if (track) {
          audioTrackRef.current = track;
          startSpeakingDetector(track);
          const stream = rebuildLocalPreviewStream();
          for (const [targetSocketId, pc] of peerConnectionsRef.current.entries()) {
            pc.addTrack(track, stream);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketService.emit("meeting:webrtc-offer", {
              roomId: room.id,
              targetSocketId,
              sdp: offer,
            });
          }
          setMediaState((prev) => ({ ...prev, isMuted: false }));
          socketService.emit("meeting:media-state", {
            roomId: room.id,
            patch: { isMuted: false },
          });
        }
      } catch {
        showToast("Unable to access microphone.", "error");
      }
      return;
    }

    const nextMuted = !mediaStateRef.current.isMuted;
    audioTrackRef.current.enabled = !nextMuted;
    setMediaState((prev) => ({
      ...prev,
      isMuted: nextMuted,
      isSpeaking: nextMuted ? false : prev.isSpeaking,
    }));
    socketService.emit("meeting:media-state", {
      roomId: room.id,
      patch: { isMuted: nextMuted, ...(nextMuted ? { isSpeaking: false } : {}) },
    });
  }, [rebuildLocalPreviewStream, showToast, startSpeakingDetector]);

  const toggleCamera = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room) return;

    if (mediaStateRef.current.isCameraOn) {
      if (cameraTrackRef.current) {
        cameraTrackRef.current.stop();
        cameraTrackRef.current = null;
      }
      await syncVideoTrackToPeers(screenTrackRef.current || null);
      setMediaState((prev) => ({ ...prev, isCameraOn: false }));
      socketService.emit("meeting:media-state", {
        roomId: room.id,
        patch: { isCameraOn: false },
      });
    } else {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const videoTrack = camStream.getVideoTracks()[0];
        if (!videoTrack) return;

        cameraTrackRef.current = videoTrack;
        if (!screenTrackRef.current) {
          await syncVideoTrackToPeers(videoTrack);
        }
        setMediaState((prev) => ({ ...prev, isCameraOn: true }));
        socketService.emit("meeting:media-state", {
          roomId: room.id,
          patch: { isCameraOn: true },
        });
      } catch {
        showToast("Unable to access camera. Check browser permissions.", "error");
      }
    }
  }, [showToast, syncVideoTrackToPeers]);

  const stopScreenShare = useCallback(async () => {
    const room = activeRoomRef.current;
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    await syncVideoTrackToPeers(cameraTrackRef.current || null);
    setMediaState((prev) => ({ ...prev, isScreenSharing: false }));
    if (room) {
      socketService.emit("meeting:media-state", {
        roomId: room.id,
        patch: { isScreenSharing: false },
      });
    }
  }, [syncVideoTrackToPeers]);

  const toggleScreenShare = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room) return;

    if (mediaStateRef.current.isScreenSharing) {
      await stopScreenShare();
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => {
        void stopScreenShare();
      };

      await syncVideoTrackToPeers(screenTrack);
      setMediaState((prev) => ({ ...prev, isScreenSharing: true }));
      socketService.emit("meeting:media-state", {
        roomId: room.id,
        patch: { isScreenSharing: true },
      });
    } catch {
      // User cancelled screen picker
    }
  }, [stopScreenShare, syncVideoTrackToPeers]);

  const toggleHandRaise = useCallback(() => {
    const room = activeRoomRef.current;
    if (!room) return;
    const nextHand = !mediaStateRef.current.isHandRaised;
    setMediaState((prev) => ({ ...prev, isHandRaised: nextHand }));
    socketService.emit("meeting:media-state", {
      roomId: room.id,
      patch: { isHandRaised: nextHand },
    });
  }, []);

  const toggleRoomLock = useCallback(() => {
    const room = activeRoomRef.current;
    if (!room) return;
    socketService.emit("meeting:lock-toggle", { roomId: room.id });
  }, []);

  const adminMuteParticipant = useCallback((targetSocketId: string) => {
    const room = activeRoomRef.current;
    if (!room) return;
    socketService.emit("meeting:admin-mute", {
      roomId: room.id,
      targetSocketId,
    });
  }, []);

  const adminKickParticipant = useCallback((targetSocketId: string) => {
    const room = activeRoomRef.current;
    if (!room) return;
    socketService.emit("meeting:admin-kick", {
      roomId: room.id,
      targetSocketId,
    });
  }, []);

  const sendChatMessage = useCallback((content: string) => {
    const room = activeRoomRef.current;
    if (!room || !content.trim()) return;
    socketService.emit("meeting:chat-send", {
      roomId: room.id,
      content: content.trim(),
    });
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const room = activeRoomRef.current;
    if (!room) return;
    socketService.emit("meeting:reaction", {
      roomId: room.id,
      emoji,
    });
  }, []);

  const refreshLobby = useCallback(() => {
    socketService.emit("meeting:list");
  }, []);

  return {
    lobbyRooms,
    activeRoom,
    selfSocketId,
    chatMessages,
    unreadChatCount,
    isChatOpen,
    setIsChatOpen,
    localStream,
    remoteStreams,
    reactions,
    mediaState,
    createRoom,
    joinRoom,
    leaveRoom,
    endMeeting,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    toggleHandRaise,
    toggleRoomLock,
    adminMuteParticipant,
    adminKickParticipant,
    sendChatMessage,
    sendReaction,
    refreshLobby,
  };
}
