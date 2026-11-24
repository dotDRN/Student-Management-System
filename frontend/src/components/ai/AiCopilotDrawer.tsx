import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Sparkles,
  X,
  Send,
  History,
  Plus,
  Trash2,
  Database,
  Brain,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Compass,
} from 'lucide-react';
import { useAiCopilotStore } from '../../store/useAiCopilotStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
  deleteAiThread,
  getAiStatus,
  getAiThreadById,
  getAiThreads,
  sendAiChatMessage,
  type AiPageContext,
  type AiStatusResponse,
  type AiThreadMessage,
  type AiThreadSummary,
} from '../../services/ai.service';
import { getApiErrorMessage } from '../../services/api';
import { Button } from '../ui/Button';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOOL_LABELS: Record<string, string> = {
  get_institution_overview: 'Dashboard & Centers',
  query_students: 'Student Roster Filter',
  get_student_360_dossier: '360° Student Dossier',
  get_exam_analytics: 'Exam Baseline/Endline',
  get_skills_and_matrix_analytics: 'Skill Matrix Analytics',
  get_attendance_and_alerts: 'Attendance & Risk Alerts',
  search_qualitative_knowledge_rag: 'Hybrid RAG Search',
  remember_entity_insight: 'Saved to Memory',
};

function renderFormattedLine(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-neutral-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function FormattedAiMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-neutral-700">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} className="text-xs font-bold uppercase tracking-wide text-brand-700 pt-2">
              {trimmed.slice(4)}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} className="text-sm font-bold text-neutral-900 pt-2">
              {trimmed.slice(3)}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const indent = line.startsWith('  ') ? 'ml-4' : 'ml-1';
          return (
            <div key={i} className={`flex items-start gap-2 ${indent}`}>
              <span className="text-brand-500 mt-1 text-[10px]">●</span>
              <span className="flex-1">{renderFormattedLine(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={i}>{renderFormattedLine(trimmed)}</p>;
      })}
    </div>
  );
}

export const AiCopilotDrawer: React.FC = () => {
  const {
    isOpen,
    closeDrawer,
    activeThreadId,
    setActiveThreadId,
    pendingPrompt,
    consumePendingPrompt,
  } = useAiCopilotStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const selectedCenterId = useAuthStore((s) => s.selectedCenterId);
  const location = useLocation();

  const [messages, setMessages] = useState<AiThreadMessage[]>([]);
  const [threads, setThreads] = useState<AiThreadSummary[]>([]);
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(false);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([]);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Detect active route & student context automatically
  const pageContext = useMemo<AiPageContext>(() => {
    const pathname = location.pathname;
    const match = pathname.match(/^\/students\/([^/]+)/);
    const candidateStudentId = match?.[1];
    const studentId = candidateStudentId && UUID_REGEX.test(candidateStudentId) ? candidateStudentId : undefined;
    const centerId = selectedCenterId && UUID_REGEX.test(selectedCenterId) ? selectedCenterId : undefined;
    return {
      route: pathname,
      ...(studentId ? { studentId } : {}),
      ...(centerId ? { centerId } : {}),
    };
  }, [location.pathname, selectedCenterId]);

  const isStaffAllowed =
    currentUser?.role && !['parent', 'student'].includes(currentUser.role);

  const loadThreads = useCallback(async () => {
    try {
      const list = await getAiThreads(20);
      setThreads(Array.isArray(list) ? list : []);
    } catch {
      // Ignore silent history fetch errors
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !isStaffAllowed) return;
    void loadThreads();
    if (!status) {
      getAiStatus()
        .then(setStatus)
        .catch(() => {});
    }
  }, [isOpen, isStaffAllowed, loadThreads, status]);

  useEffect(() => {
    if (isOpen && pendingPrompt) {
      const text = consumePendingPrompt();
      if (text) setInput(text);
    }
  }, [isOpen, pendingPrompt, consumePendingPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSelectThread = async (threadId: string) => {
    setError(null);
    try {
      const record = await getAiThreadById(threadId);
      setActiveThreadId(record.id);
      setMessages(record.messages || []);
      setShowThreads(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load conversation thread.'));
    }
  };

  const handleNewThread = () => {
    setActiveThreadId(null);
    setMessages([]);
    setSuggestedFollowUps([]);
    setError(null);
    setShowThreads(false);
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteAiThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        handleNewThread();
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not delete thread.'));
    }
  };

  const handleSend = async (overrideText?: string) => {
    const promptText = (overrideText ?? input).trim();
    if (!promptText || sending) return;

    setError(null);
    setInput('');
    const optimisticUserMsg: AiThreadMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: promptText,
      createdAt: new Date().toISOString(),
      context: pageContext,
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);
    setSending(true);

    try {
      const res = await sendAiChatMessage({
        message: promptText,
        threadId: activeThreadId ?? undefined,
        context: pageContext,
      });

      setActiveThreadId(res.threadId);
      const assistantMsg: AiThreadMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        createdAt: new Date().toISOString(),
        toolsUsed: res.toolsUsed,
        citations: res.citations,
        providerMode: res.providerMode,
        context: pageContext,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setSuggestedFollowUps(res.suggestedFollowUps || []);
      void loadThreads();
    } catch (err) {
      setError(getApiErrorMessage(err, 'AI Orchestrator could not complete your request.'));
    } finally {
      setSending(false);
    }
  };

  if (!isOpen || !isStaffAllowed) return null;

  const starterPrompts = pageContext.studentId
    ? [
        'Give me a complete 360° summary of this student’s academics, skills, and attendance.',
        'What are the best next upskilling steps staff should follow for this student?',
        'Search any teacher remarks, career goals, or alerts recorded for this student.',
      ]
    : [
        'Give me an overview of student counts, attendance, and fee collection across my centers.',
        'Compare Baseline vs Endline exam improvements across subjects.',
        'Analyze our cohort skill gaps and tell staff what upskilling activities to prioritize.',
        'Which students have low attendance or open early-warning risk alerts?',
      ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity"
        onClick={closeDrawer}
      />

      {/* Drawer Panel */}
      <aside className="relative z-10 w-full max-w-xl bg-white h-full shadow-2xl border-l border-neutral-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-neutral-200 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center shadow-md shadow-brand-500/30 shrink-0">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm tracking-tight truncate">
                  Ask EdBase AI
                </h2>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-white/10 text-brand-200 border border-white/15">
                  Universal Orchestrator
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate flex items-center gap-1.5 mt-0.5">
                <Brain size={11} className="text-violet-300" />
                {status?.mode === 'gemini'
                  ? `Live Gemini (${status.model}) + Hybrid RAG Memory`
                  : 'Hybrid RAG + Multi-Component Domain Engine'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowThreads((v) => !v)}
              className={`p-2 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                showThreads
                  ? 'bg-white/20 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Conversation Memory History"
            >
              <History size={16} />
            </button>
            <button
              onClick={handleNewThread}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="New Conversation"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={closeDrawer}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close AI Copilot"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Active Context Ribbon */}
        <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200/80 flex items-center justify-between gap-2 text-[11px] text-neutral-600">
          <div className="flex items-center gap-1.5 truncate">
            <Compass size={13} className="text-brand-600 shrink-0" />
            <span className="font-medium text-neutral-700">Active Context:</span>
            <span className="truncate font-mono text-neutral-500">
              {pageContext.studentId
                ? `Student Profile (${pageContext.studentId.slice(0, 8)}…)`
                : pageContext.route || '/dashboard'}
            </span>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
            <Database size={10} />
            RBAC Scoped
          </span>
        </div>

        {/* Thread History Overlay */}
        {showThreads && (
          <div className="border-b border-neutral-200 bg-neutral-50 max-h-64 overflow-y-auto p-3 space-y-1.5">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Saved Episodic Memory Threads ({threads.length})
              </span>
              <button
                onClick={handleNewThread}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                + Start Fresh
              </button>
            </div>
            {threads.length === 0 ? (
              <p className="text-xs text-neutral-500 py-3 text-center">
                No previous AI sessions yet. Your conversations will be remembered here.
              </p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => void handleSelectThread(t.id)}
                  className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    activeThreadId === t.id
                      ? 'bg-brand-50 border-brand-200'
                      : 'bg-white border-neutral-200 hover:border-brand-300'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900 truncate">{t.title}</p>
                    <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                      {t.messageCount} msgs · {new Date(t.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => void handleDeleteThread(t.id, e)}
                    className="p-1.5 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 shrink-0"
                    title="Delete thread"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/50">
          {messages.length === 0 && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-2xs">
                <div className="flex items-center gap-2 text-brand-700 font-semibold text-sm mb-1.5">
                  <Sparkles size={16} />
                  Universal Academic & Operations Intelligence
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  I can read and analyze every module in EdBase—Students, Attendance, Baseline/Endline
                  Exams, Skill Matrices, Career Pathways, Risk Alerts, and qualitative educator remarks—while
                  remembering institutional insights across sessions.
                </p>
                {status?.availableTools && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {status.availableTools.slice(0, 6).map((tool) => (
                      <span
                        key={tool.name}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600 border border-neutral-200"
                      >
                        {tool.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2 px-1">
                  Suggested Staff Queries
                </p>
                <div className="space-y-2">
                  {starterPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => void handleSend(prompt)}
                      className="w-full text-left p-3 rounded-xl bg-white border border-neutral-200 hover:border-brand-400 hover:bg-brand-50/40 text-xs text-neutral-700 font-medium transition-all shadow-2xs"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const citationsOpen = Boolean(expandedCitations[msg.id]);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl px-4 py-3 shadow-2xs ${
                    isUser
                      ? 'bg-slate-900 text-white rounded-br-sm text-[13px]'
                      : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm w-full'
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <>
                      {/* Tool provenance chips */}
                      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2.5 pb-2 border-b border-neutral-100">
                          {msg.toolsUsed.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-200/70"
                            >
                              <Database size={10} />
                              {TOOL_LABELS[t] || t}
                            </span>
                          ))}
                        </div>
                      )}

                      <FormattedAiMarkdown content={msg.content} />

                      {/* Expandable Citations */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-neutral-100">
                          <button
                            onClick={() =>
                              setExpandedCitations((prev) => ({
                                ...prev,
                                [msg.id]: !prev[msg.id],
                              }))
                            }
                            className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 hover:text-brand-700"
                          >
                            <BookOpen size={12} />
                            Sources & Grounded Records ({msg.citations.length})
                            {citationsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>

                          {citationsOpen && (
                            <div className="mt-2 space-y-1.5">
                              {msg.citations.map((cit, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 rounded-lg bg-neutral-50 border border-neutral-200/80 text-[11px]"
                                >
                                  <div className="font-semibold text-neutral-800">{cit.title}</div>
                                  <div className="text-neutral-600 mt-0.5 line-clamp-2">
                                    {cit.snippet}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white border border-neutral-200 text-xs text-neutral-600 shadow-2xs">
              <Loader2 size={15} className="animate-spin text-brand-600" />
              <span>Orchestrator is querying live EdBase modules & RAG memory…</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {!sending && suggestedFollowUps.length > 0 && (
            <div className="pt-1 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Follow-up Questions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedFollowUps.map((f, idx) => (
                  <button
                    key={idx}
                    onClick={() => void handleSend(f)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white border border-neutral-200 hover:border-brand-400 hover:text-brand-700 text-neutral-600 transition-colors text-left"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="p-3 border-t border-neutral-200 bg-white"
        >
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                pageContext.studentId
                  ? 'Ask about this student’s scores, skills, upskilling steps, or say "Remember that..."'
                  : 'Ask about student academics, attendance, skill gaps, career steps, or remarks...'
              }
              className="flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!input.trim() || sending}
              className="h-10 px-3.5 shrink-0"
            >
              <Send size={16} />
            </Button>
          </div>
          <p className="text-[10px] text-neutral-400 mt-1.5 px-1">
            Scoped strictly to your authorized centers. Type “Remember that…” to save institutional notes.
          </p>
        </form>
      </aside>
    </div>
  );
};
