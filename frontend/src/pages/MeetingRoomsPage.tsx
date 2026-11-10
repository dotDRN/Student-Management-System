import React, { useEffect, useMemo, useRef, useState } from "react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { useAuthStore } from "../store/useAuthStore";
import { useWebRTCMeeting, type ActiveReaction } from "../hooks/useWebRTCMeeting";
import { listCenters } from "../services/centers.service";
import type { CenterSummary } from "../types";
import type {
  MeetingCategory,
  MeetingParticipant,
  MeetingRoom,
} from "../types/socket";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  Hand,
  MessageSquare,
  Users,
  PhoneOff,
  Lock,
  Unlock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Crown,
  Volume2,
  UserX,
  Maximize2,
  LayoutGrid,
  Send,
  Clock,
  Building2,
  Radio,
  Smile,
} from "lucide-react";

const CATEGORY_META: Record<
  MeetingCategory,
  { label: string; badgeClass: string; dotClass: string }
> = {
  standup: {
    label: "Daily Standup",
    badgeClass: "bg-brand-50 text-brand-700 border-brand-200/80",
    dotClass: "bg-brand-500",
  },
  academic: {
    label: "Academic Review",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200/80",
    dotClass: "bg-violet-500",
  },
  operations: {
    label: "Center Operations",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    dotClass: "bg-emerald-500",
  },
  lounge: {
    label: "Staff Lounge",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80",
    dotClass: "bg-amber-500",
  },
};

const QUICK_REACTIONS = ["👍", "👏", "🔥", "💡", "✅"];

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

function formatDuration(isoStart: string, nowMs: number): string {
  const diffSec = Math.max(
    0,
    Math.floor((nowMs - new Date(isoStart).getTime()) / 1000),
  );
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatRemainingIdle(isoExpires: string, nowMs: number): string {
  const remSec = Math.max(
    0,
    Math.ceil((new Date(isoExpires).getTime() - nowMs) / 1000),
  );
  const mins = Math.floor(remSec / 60);
  const secs = remSec % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

interface ParticipantTileProps {
  participant: MeetingParticipant;
  stream: MediaStream | null;
  isSelf: boolean;
  canModerate: boolean;
  reaction?: ActiveReaction;
  isSpotlight?: boolean;
  onPinToggle: () => void;
  onAdminMute: (socketId: string) => void;
  onAdminKick: (socketId: string) => void;
}

const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  stream,
  isSelf,
  canModerate,
  reaction,
  isSpotlight = false,
  onPinToggle,
  onAdminMute,
  onAdminKick,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showVideo =
    Boolean(stream && stream.getVideoTracks().length > 0) &&
    (participant.mediaState.isCameraOn ||
      participant.mediaState.isScreenSharing);

  useEffect(() => {
    if (videoRef.current && stream && showVideo) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
    }
  }, [stream, showVideo]);

  useEffect(() => {
    if (!isSelf && audioRef.current && stream) {
      if (audioRef.current.srcObject !== stream) {
        audioRef.current.srcObject = stream;
      }
    }
  }, [isSelf, stream]);

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden bg-slate-900 border transition-all flex items-center justify-center select-none ${
        participant.mediaState.isSpeaking && !participant.mediaState.isMuted
          ? "border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10"
          : participant.mediaState.isHandRaised
            ? "border-amber-500/70 ring-1 ring-amber-500/30"
            : "border-slate-800/90 hover:border-slate-700"
      } ${isSpotlight ? "h-full w-full min-h-[320px]" : "min-h-[200px] h-full w-full"}`}
    >
      {/* Remote audio playback */}
      {!isSelf && <audio ref={audioRef} autoPlay playsInline />}

      {/* Video or Screen Stream */}
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className={`w-full h-full ${
            participant.mediaState.isScreenSharing
              ? "object-contain bg-slate-950"
              : "object-cover"
          } ${isSelf && !participant.mediaState.isScreenSharing ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        /* Discord-Style Voice Avatar Stage */
        <div className="flex flex-col items-center justify-center p-6">
          <div className="relative">
            {participant.mediaState.isSpeaking &&
              !participant.mediaState.isMuted && (
                <span className="absolute -inset-2 rounded-full bg-emerald-500/25 animate-ping" />
              )}
            <div
              className={`relative h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-xl transition-transform ${
                participant.mediaState.isSpeaking &&
                !participant.mediaState.isMuted
                  ? "bg-gradient-to-tr from-emerald-500 to-brand-600 scale-105 ring-4 ring-emerald-400/50"
                  : "bg-gradient-to-tr from-brand-600 to-violet-600"
              }`}
            >
              {getInitials(participant.fullName)}
            </div>
          </div>
        </div>
      )}

      {/* Floating Emoji Reaction */}
      {reaction && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none animate-bounce">
          <div className="text-4xl bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-700 shadow-2xl">
            {reaction.emoji}
          </div>
        </div>
      )}

      {/* Top Left Status Badges */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-10">
        {participant.isRoomAdmin && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30 backdrop-blur-md">
            <Crown size={11} />
            Room Admin
          </span>
        )}
        {participant.mediaState.isScreenSharing && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
            <MonitorUp size={11} />
            Sharing Screen
          </span>
        )}
        {participant.mediaState.isHandRaised && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/25 text-amber-300 border border-amber-500/40 backdrop-blur-md">
            <Hand size={11} />
            Hand Raised
          </span>
        )}
      </div>

      {/* Top Right Hover Actions (Pin + Room Admin Controls) */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          type="button"
          onClick={onPinToggle}
          title={isSpotlight ? "Unpin from spotlight" : "Spotlight tile"}
          className="p-1.5 rounded-lg bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md cursor-pointer"
        >
          <Maximize2 size={14} />
        </button>
        {canModerate && !isSelf && (
          <>
            {!participant.mediaState.isMuted && (
              <button
                type="button"
                onClick={() => onAdminMute(participant.socketId)}
                title="Mute participant microphone"
                className="p-1.5 rounded-lg bg-slate-950/80 hover:bg-amber-600 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md cursor-pointer"
              >
                <MicOff size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onAdminKick(participant.socketId)}
              title="Remove participant from room"
              className="p-1.5 rounded-lg bg-slate-950/80 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md cursor-pointer"
            >
              <UserX size={14} />
            </button>
          </>
        )}
      </div>

      {/* Bottom Participant Name & Mic Pill */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 z-10 pointer-events-none">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800/80 max-w-[80%]">
          <span className="text-xs font-semibold text-white truncate">
            {participant.fullName} {isSelf ? "(You)" : ""}
          </span>
          <span className="text-[10px] text-slate-400 capitalize hidden sm:inline">
            • {participant.role.replace("_", " ")}
          </span>
        </div>

        <div
          className={`h-7 w-7 rounded-lg flex items-center justify-center backdrop-blur-md border ${
            participant.mediaState.isMuted
              ? "bg-red-500/20 border-red-500/40 text-red-400"
              : participant.mediaState.isSpeaking
                ? "bg-emerald-500/25 border-emerald-500/40 text-emerald-300"
                : "bg-slate-950/80 border-slate-800 text-slate-300"
          }`}
        >
          {participant.mediaState.isMuted ? (
            <MicOff size={14} />
          ) : (
            <Mic size={14} />
          )}
        </div>
      </div>
    </div>
  );
};

export const MeetingRoomsPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);
  const {
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
  } = useWebRTCMeeting();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedCategory, setSelectedCategory] = useState<
    MeetingCategory | "all"
  >("all");
  const [centers, setCenters] = useState<CenterSummary[]>([]);

  // Create Room Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCategory, setNewRoomCategory] =
    useState<MeetingCategory>("standup");
  const [newRoomCenterId, setNewRoomCenterId] = useState<string>("");
  const [startWithVideo, setStartWithVideo] = useState(false);

  // Active Room Stage UI state
  const [sidePanelTab, setSidePanelTab] = useState<"chat" | "participants">(
    "chat",
  );
  const [pinnedSocketId, setPinnedSocketId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [showReactionTray, setShowReactionTray] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Live 1-second ticker for meeting duration and idle auto-close countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load centers for room scoping
  useEffect(() => {
    listCenters()
      .then((res: CenterSummary[]) => setCenters(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, []);

  // Auto-scroll ephemeral chat
  useEffect(() => {
    if (isChatOpen && sidePanelTab === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length, isChatOpen, sidePanelTab]);

  // Automatically spotlight anyone who starts sharing their screen
  useEffect(() => {
    if (!activeRoom) {
      setPinnedSocketId(null);
      return;
    }
    const screenSharer = activeRoom.participants.find(
      (p) => p.mediaState.isScreenSharing,
    );
    if (screenSharer) {
      setPinnedSocketId(screenSharer.socketId);
    } else if (
      pinnedSocketId &&
      !activeRoom.participants.some((p) => p.socketId === pinnedSocketId)
    ) {
      setPinnedSocketId(null);
    }
  }, [activeRoom, pinnedSocketId]);

  const isCurrentUserRoomAdmin = useMemo(() => {
    if (!activeRoom || !currentUser) return false;
    const isOrgAdmin = ["super_admin", "center_admin", "tech_admin"].includes(
      currentUser.role,
    );
    return activeRoom.hostUserId === currentUser.id || isOrgAdmin;
  }, [activeRoom, currentUser]);

  const filteredRooms = useMemo(() => {
    if (selectedCategory === "all") return lobbyRooms;
    return lobbyRooms.filter((r) => r.category === selectedCategory);
  }, [lobbyRooms, selectedCategory]);

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const matchedCenter = centers.find((c) => c.id === newRoomCenterId);
    await createRoom({
      name: newRoomName.trim(),
      category: newRoomCategory,
      centerId: matchedCenter ? matchedCenter.id : null,
      centerName: matchedCenter ? matchedCenter.name : null,
      startWithVideo,
    });
    setNewRoomName("");
    setIsCreateModalOpen(false);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput("");
  };

  // ===========================================================================
  // VIEW 1: ACTIVE MEETING ROOM STAGE (Discord / Teams Style Dark Canvas)
  // ===========================================================================
  if (activeRoom) {
    const spotlightParticipant = pinnedSocketId
      ? activeRoom.participants.find((p) => p.socketId === pinnedSocketId) ||
        null
      : null;

    const otherParticipants = spotlightParticipant
      ? activeRoom.participants.filter(
          (p) => p.socketId !== spotlightParticipant.socketId,
        )
      : activeRoom.participants;

    const getStreamForParticipant = (p: MeetingParticipant) =>
      p.socketId === selfSocketId
        ? localStream
        : remoteStreams[p.socketId] || null;

    return (
      <div className="h-[calc(100vh-5.5rem)] w-full bg-slate-950 text-slate-100 rounded-2xl border border-slate-800/90 shadow-2xl flex flex-col overflow-hidden select-none">
        {/* Top Stage Bar */}
        <div className="h-14 px-4 sm:px-6 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <h2 className="font-bold text-sm sm:text-base text-white truncate">
                {activeRoom.name}
              </h2>
            </div>

            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
              {CATEGORY_META[activeRoom.category]?.label || "Meeting"}
            </span>

            {activeRoom.isLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <Lock size={11} />
                Locked
              </span>
            )}

            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800/90 text-slate-300 border border-slate-700/80"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <Clock size={12} className="text-brand-400" />
              {formatDuration(activeRoom.createdAt, nowMs)}
            </span>
          </div>

          {/* Right Stage Controls (Layout + Room Admin Actions) */}
          <div className="flex items-center gap-2">
            {spotlightParticipant && (
              <button
                type="button"
                onClick={() => setPinnedSocketId(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
              >
                <LayoutGrid size={14} />
                <span className="hidden sm:inline">Grid View</span>
              </button>
            )}

            {isCurrentUserRoomAdmin && (
              <>
                <button
                  type="button"
                  onClick={toggleRoomLock}
                  title={
                    activeRoom.isLocked
                      ? "Unlock room so staff can join"
                      : "Lock room to prevent new joins"
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    activeRoom.isLocked
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                      : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                  }`}
                >
                  {activeRoom.isLocked ? (
                    <>
                      <Unlock size={13} />
                      <span className="hidden sm:inline">Unlock Room</span>
                    </>
                  ) : (
                    <>
                      <Lock size={13} />
                      <span className="hidden sm:inline">Lock Room</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={endMeeting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 transition-colors cursor-pointer"
                >
                  <ShieldAlert size={13} />
                  <span className="hidden sm:inline">End for All</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Center Stage + Collapsible Side Drawer */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Video / Voice Grid Area */}
          <div className="flex-1 p-3 sm:p-4 overflow-y-auto flex flex-col gap-3">
            {spotlightParticipant ? (
              <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
                <div className="flex-1 min-h-[280px]">
                  <ParticipantTile
                    participant={spotlightParticipant}
                    stream={getStreamForParticipant(spotlightParticipant)}
                    isSelf={spotlightParticipant.socketId === selfSocketId}
                    canModerate={isCurrentUserRoomAdmin}
                    reaction={reactions[spotlightParticipant.socketId]}
                    isSpotlight
                    onPinToggle={() => setPinnedSocketId(null)}
                    onAdminMute={adminMuteParticipant}
                    onAdminKick={adminKickParticipant}
                  />
                </div>
                {otherParticipants.length > 0 && (
                  <div className="lg:w-64 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto shrink-0">
                    {otherParticipants.map((p) => (
                      <div
                        key={p.socketId}
                        className="w-48 lg:w-full h-36 shrink-0"
                      >
                        <ParticipantTile
                          participant={p}
                          stream={getStreamForParticipant(p)}
                          isSelf={p.socketId === selfSocketId}
                          canModerate={isCurrentUserRoomAdmin}
                          reaction={reactions[p.socketId]}
                          onPinToggle={() => setPinnedSocketId(p.socketId)}
                          onAdminMute={adminMuteParticipant}
                          onAdminKick={adminKickParticipant}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`flex-1 grid gap-3 sm:gap-4 auto-rows-fr ${
                  activeRoom.participants.length === 1
                    ? "grid-cols-1 max-w-3xl mx-auto w-full"
                    : activeRoom.participants.length === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : activeRoom.participants.length <= 4
                        ? "grid-cols-1 sm:grid-cols-2"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                }`}
              >
                {activeRoom.participants.map((p) => (
                  <ParticipantTile
                    key={p.socketId}
                    participant={p}
                    stream={getStreamForParticipant(p)}
                    isSelf={p.socketId === selfSocketId}
                    canModerate={isCurrentUserRoomAdmin}
                    reaction={reactions[p.socketId]}
                    onPinToggle={() => setPinnedSocketId(p.socketId)}
                    onAdminMute={adminMuteParticipant}
                    onAdminKick={adminKickParticipant}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Ephemeral Chat & Roster Side Panel */}
          {isChatOpen && (
            <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0">
              {/* Panel Tabs */}
              <div className="p-2 border-b border-slate-800 grid grid-cols-2 gap-1 bg-slate-950/50">
                <button
                  type="button"
                  onClick={() => setSidePanelTab("chat")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    sidePanelTab === "chat"
                      ? "bg-brand-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <MessageSquare size={14} />
                  Temporary Chat
                </button>
                <button
                  type="button"
                  onClick={() => setSidePanelTab("participants")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    sidePanelTab === "participants"
                      ? "bg-brand-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Users size={14} />
                  Staff ({activeRoom.participants.length})
                </button>
              </div>

              {sidePanelTab === "chat" ? (
                <>
                  <div className="px-3.5 py-2 bg-brand-950/60 border-b border-brand-500/20 text-[11px] text-brand-200 flex items-center gap-2">
                    <Sparkles size={13} className="text-brand-400 shrink-0" />
                    <span>
                      Ephemeral chat: all messages are automatically erased when
                      this meeting ends.
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                    {chatMessages.map((msg) =>
                      msg.type === "system" ? (
                        <div
                          key={msg.id}
                          className="text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-1.5 text-center"
                        >
                          {msg.content}
                        </div>
                      ) : (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            msg.senderId === currentUser?.id
                              ? "items-end"
                              : "items-start"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[11px] font-semibold text-slate-300">
                              {msg.senderId === currentUser?.id
                                ? "You"
                                : msg.senderName}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div
                            className={`px-3 py-2 rounded-xl text-xs max-w-[85%] break-words ${
                              msg.senderId === currentUser?.id
                                ? "bg-brand-600 text-white rounded-br-xs"
                                : "bg-slate-800 text-slate-100 border border-slate-700/80 rounded-bl-xs"
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ),
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form
                    onSubmit={handleChatSubmit}
                    className="p-3 border-t border-slate-800 flex items-center gap-2 bg-slate-950/40"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Send a temporary message…"
                      className="flex-1 h-9 rounded-lg bg-slate-800 border border-slate-700 px-3 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="h-9 w-9 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {activeRoom.participants.map((p) => (
                    <div
                      key={p.socketId}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-brand-600 to-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {getInitials(p.fullName)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                            <span>
                              {p.fullName}{" "}
                              {p.socketId === selfSocketId ? "(You)" : ""}
                            </span>
                            {p.isRoomAdmin && (
                              <Crown size={12} className="text-brand-400" />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 capitalize">
                            {p.role.replace("_", " ")}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {p.mediaState.isHandRaised && (
                          <span className="p-1 rounded bg-amber-500/20 text-amber-300">
                            <Hand size={13} />
                          </span>
                        )}
                        <span
                          className={`p-1 rounded ${
                            p.mediaState.isMuted
                              ? "text-red-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {p.mediaState.isMuted ? (
                            <MicOff size={14} />
                          ) : (
                            <Mic size={14} />
                          )}
                        </span>
                        {isCurrentUserRoomAdmin &&
                          p.socketId !== selfSocketId && (
                            <>
                              {!p.mediaState.isMuted && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    adminMuteParticipant(p.socketId)
                                  }
                                  title="Mute microphone"
                                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 cursor-pointer"
                                >
                                  <Volume2 size={14} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => adminKickParticipant(p.socketId)}
                                title="Remove from room"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 cursor-pointer"
                              >
                                <UserX size={14} />
                              </button>
                            </>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Bottom Floating Control Dock */}
        <div className="h-18 px-4 bg-slate-900 border-t border-slate-800/90 flex items-center justify-center gap-2 sm:gap-3 relative shrink-0">
          {/* Mic Toggle */}
          <button
            type="button"
            onClick={() => void toggleMute()}
            className={`h-11 px-4 rounded-xl font-semibold text-xs flex items-center gap-2 border transition-all cursor-pointer ${
              mediaState.isMuted
                ? "bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25"
                : "bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
            }`}
          >
            {mediaState.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            <span className="hidden sm:inline">
              {mediaState.isMuted ? "Unmute" : "Mute"}
            </span>
          </button>

          {/* Camera Toggle */}
          <button
            type="button"
            onClick={() => void toggleCamera()}
            className={`h-11 px-4 rounded-xl font-semibold text-xs flex items-center gap-2 border transition-all cursor-pointer ${
              mediaState.isCameraOn
                ? "bg-brand-600 text-white border-brand-500 hover:bg-brand-500"
                : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
            }`}
          >
            {mediaState.isCameraOn ? (
              <Video size={18} />
            ) : (
              <VideoOff size={18} />
            )}
            <span className="hidden sm:inline">
              {mediaState.isCameraOn ? "Camera On" : "Camera Off"}
            </span>
          </button>

          {/* Screen Share Toggle */}
          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            className={`h-11 px-4 rounded-xl font-semibold text-xs flex items-center gap-2 border transition-all cursor-pointer ${
              mediaState.isScreenSharing
                ? "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500"
                : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <MonitorUp size={18} />
            <span className="hidden md:inline">
              {mediaState.isScreenSharing ? "Stop Share" : "Share Screen"}
            </span>
          </button>

          {/* Raise Hand Toggle */}
          <button
            type="button"
            onClick={toggleHandRaise}
            className={`h-11 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 border transition-all cursor-pointer ${
              mediaState.isHandRaised
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
            }`}
            title="Raise Hand"
          >
            <Hand size={18} />
            <span className="hidden lg:inline">
              {mediaState.isHandRaised ? "Lower Hand" : "Raise Hand"}
            </span>
          </button>

          {/* Floating Reaction Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReactionTray((prev) => !prev)}
              className="h-11 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Send Reaction"
            >
              <Smile size={18} />
            </button>
            {showReactionTray && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-2xl p-1.5 flex items-center gap-1 shadow-2xl z-30">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      sendReaction(emoji);
                      setShowReactionTray(false);
                    }}
                    className="h-9 w-9 rounded-xl hover:bg-slate-800 flex items-center justify-center text-lg transition-transform hover:scale-125 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ephemeral Chat & Roster Toggle */}
          <button
            type="button"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`relative h-11 px-4 rounded-xl font-semibold text-xs flex items-center gap-2 border transition-all cursor-pointer ${
              isChatOpen
                ? "bg-brand-600/25 text-brand-300 border-brand-500/40"
                : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <MessageSquare size={18} />
            <span className="hidden md:inline">Chat & Staff</span>
            {unreadChatCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-500 text-white text-[10px] font-bold">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Leave Room Button */}
          <button
            type="button"
            onClick={leaveRoom}
            className="h-11 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-2 shadow-sm cursor-pointer ml-2"
          >
            <PhoneOff size={17} />
            <span>Leave</span>
          </button>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // VIEW 2: DISCORD-STYLE STAFF MEETING LOBBY
  // ===========================================================================
  return (
    <PageWrapper
      title="Staff Huddles & Meeting Rooms"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={refreshLobby}>
            <RefreshCw size={14} className="mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} className="mr-1.5" />
            Start New Room
          </Button>
        </div>
      }
    >
      {/* Enterprise Feature Banner */}
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950 text-white p-5 sm:p-6 border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
            <Radio size={12} className="animate-pulse" />
            Employee-Only Workspace Channels
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">
            Instant Voice Huddles, Video Syncs & Screen Sharing
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Hop into any active room to talk with staff across centers, toggle
            your camera or share your screen on demand. Room creators act as{" "}
            <span className="text-white font-semibold">Room Admins</span>, and
            in-call chat is{" "}
            <span className="text-white font-semibold">
              100% ephemeral
            </span>{" "}
            (automatically erased when a meeting ends or after 5 minutes of
            inactivity).
          </p>
        </div>
        <div className="shrink-0">
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full md:w-auto"
          >
            <Plus size={16} className="mr-2" />
            Create Staff Room
          </Button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(
          [
            { id: "all", label: `All Active Rooms (${lobbyRooms.length})` },
            { id: "standup", label: "Daily Standup" },
            { id: "academic", label: "Academic Review" },
            { id: "operations", label: "Center Operations" },
            { id: "lounge", label: "Staff Lounge" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              selectedCategory === tab.id
                ? "bg-brand-600 text-white border-brand-600 shadow-2xs"
                : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Rooms Grid */}
      {filteredRooms.length === 0 ? (
        <Card className="py-16 text-center flex flex-col items-center justify-center">
          <div className="h-14 w-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 border border-brand-100">
            <Video size={26} />
          </div>
          <h3 className="text-base font-bold text-neutral-900 mb-1">
            No active meeting rooms right now
          </h3>
          <p className="text-sm text-neutral-500 max-w-md mb-5">
            Start an instant voice or video room for your center or workspace.
            Colleagues will see it live here and can join with one click.
          </p>
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={16} className="mr-1.5" />
            Start First Room
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRooms.map((room: MeetingRoom) => {
            const cat = CATEGORY_META[room.category] || CATEGORY_META.standup;
            const hasScreenShare = room.participants.some(
              (p) => p.mediaState.isScreenSharing,
            );
            const isIdle =
              room.participants.length === 0 && Boolean(room.idleExpiresAt);

            return (
              <Card
                key={room.id}
                className="flex flex-col justify-between hover:border-brand-300 transition-all"
              >
                <div>
                  {/* Card Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${cat.badgeClass}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${cat.dotClass}`}
                        />
                        {cat.label}
                      </span>

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200/80">
                        <Building2 size={11} />
                        {room.centerName || "All Centers"}
                      </span>
                    </div>

                    <span
                      className="text-xs font-medium text-neutral-400"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {formatDuration(room.createdAt, nowMs)}
                    </span>
                  </div>

                  {/* Room Title & Host */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-neutral-900 truncate">
                        {room.name}
                      </h3>
                      {room.isLocked && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                          title="Locked by Room Admin"
                        >
                          <Lock size={11} />
                          Locked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Room Admin:{" "}
                      <span className="font-medium text-neutral-700">
                        {room.hostName}
                      </span>
                    </p>
                  </div>

                  {/* Status Pills (Screen Share / Idle Auto-Close Countdown) */}
                  {hasScreenShare && (
                    <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                      <MonitorUp size={14} className="text-emerald-600" />
                      Live Screen Share in progress
                    </div>
                  )}

                  {isIdle && room.idleExpiresAt && (
                    <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-800 text-xs font-medium flex items-center justify-between">
                      <span>Room is currently empty</span>
                      <span
                        className="font-semibold"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        Closes in{" "}
                        {formatRemainingIdle(room.idleExpiresAt, nowMs)}
                      </span>
                    </div>
                  )}

                  {/* Discord-Style Live Participant Stack */}
                  <div className="mb-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                      In Room ({room.participants.length})
                    </div>
                    {room.participants.length === 0 ? (
                      <div className="text-xs text-neutral-400 italic py-2">
                        Nobody inside right now — hop in to resume!
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {room.participants.map((p) => (
                          <div
                            key={p.socketId}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200/60"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`h-6 w-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0 ${
                                  p.mediaState.isSpeaking &&
                                  !p.mediaState.isMuted
                                    ? "bg-emerald-600 ring-2 ring-emerald-400"
                                    : "bg-brand-600"
                                }`}
                              >
                                {getInitials(p.fullName)}
                              </div>
                              <span className="text-xs font-medium text-neutral-800 truncate">
                                {p.fullName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-neutral-400">
                              {p.mediaState.isScreenSharing && (
                                <MonitorUp
                                  size={13}
                                  className="text-emerald-600"
                                />
                              )}
                              {p.mediaState.isCameraOn && (
                                <Video size={13} className="text-brand-600" />
                              )}
                              {p.mediaState.isMuted ? (
                                <MicOff size={13} className="text-red-500" />
                              ) : (
                                <Mic size={13} className="text-emerald-600" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Join Room Action Footer */}
                <div className="pt-3 border-t border-neutral-100 flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => void joinRoom(room.id, false)}
                  >
                    <Mic size={15} className="mr-1.5" />
                    Join Voice
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void joinRoom(room.id, true)}
                    title="Join with camera enabled"
                  >
                    <Video size={15} className="mr-1.5" />
                    Join Video
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Room Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Start a Staff Meeting Room"
      >
        <form onSubmit={handleCreateRoomSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
              Room Title *
            </label>
            <input
              type="text"
              required
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="e.g. Weekly Curriculum Sync or Center A Standup"
              className="w-full h-10 rounded-lg border border-neutral-200 px-3.5 text-sm focus:outline-none focus:ring-3 focus:ring-brand-500/15 focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                Room Category
              </label>
              <select
                value={newRoomCategory}
                onChange={(e) =>
                  setNewRoomCategory(e.target.value as MeetingCategory)
                }
                className="w-full h-10 rounded-lg border border-neutral-200 px-3 text-sm bg-white focus:outline-none focus:border-brand-500"
              >
                <option value="standup">Daily Standup</option>
                <option value="academic">Academic Review</option>
                <option value="operations">Center Operations</option>
                <option value="lounge">Staff Lounge</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                Center Scope
              </label>
              <select
                value={newRoomCenterId}
                onChange={(e) => setNewRoomCenterId(e.target.value)}
                className="w-full h-10 rounded-lg border border-neutral-200 px-3 text-sm bg-white focus:outline-none focus:border-brand-500"
              >
                <option value="">All Workspace Staff</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={startWithVideo}
              onChange={(e) => setStartWithVideo(e.target.checked)}
              className="rounded border-neutral-300"
            />
            <span className="text-xs font-medium text-neutral-700">
              Turn on my camera immediately when joining
            </span>
          </label>

          <div className="p-3 rounded-xl bg-brand-50/70 border border-brand-100 text-xs text-brand-800">
            You will be assigned as the <strong>Room Admin</strong> with
            controls to lock the room, mute/remove participants, or end the
            meeting for everyone.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create & Join Room
            </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
};
