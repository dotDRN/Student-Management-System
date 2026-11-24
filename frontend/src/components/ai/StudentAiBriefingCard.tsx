import React, { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  Brain,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  RefreshCw,
  MessageSquare,
  Languages,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  addEntityAiMemory,
  generateStudentAiBriefing,
  getEntityAiMemories,
  type AiEntityMemory,
  type Student360Briefing,
} from '../../services/ai.service';
import { getApiErrorMessage } from '../../services/api';
import { useAiCopilotStore } from '../../store/useAiCopilotStore';
import { useToast } from '../../hooks/useToast';

interface StudentAiBriefingCardProps {
  studentId: string;
  studentName: string;
}

const READINESS_META: Record<
  Student360Briefing['readinessStatus'],
  { label: string; variant: 'success' | 'primary' | 'warning' | 'danger' }
> = {
  thriving: { label: 'Thriving', variant: 'success' },
  steady: { label: 'Steady Progress', variant: 'primary' },
  needs_support: { label: 'Needs Support', variant: 'warning' },
  high_priority: { label: 'High Priority Intervention', variant: 'danger' },
};

export const StudentAiBriefingCard: React.FC<StudentAiBriefingCardProps> = ({
  studentId,
  studentName,
}) => {
  const toast = useToast();
  const openCopilot = useAiCopilotStore((s) => s.openDrawer);

  const [briefing, setBriefing] = useState<Student360Briefing | null>(null);
  const [memories, setMemories] = useState<AiEntityMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<'english' | 'hindi' | 'marathi'>('english');
  const [copied, setCopied] = useState(false);

  const [memoryNote, setMemoryNote] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  const loadMemories = useCallback(async () => {
    try {
      const list = await getEntityAiMemories('student', studentId);
      setMemories(Array.isArray(list) ? list : []);
    } catch {
      // Non-blocking
    }
  }, [studentId]);

  useEffect(() => {
    setBriefing(null);
    setError(null);
    void loadMemories();
  }, [studentId, loadMemories]);

  const handleGenerateBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateStudentAiBriefing(studentId);
      setBriefing(result);
      void loadMemories();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not generate AI briefing.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMemoryNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoryNote.trim()) return;
    setSavingMemory(true);
    try {
      await addEntityAiMemory({
        entityType: 'student',
        entityId: studentId,
        category: 'staff_observation',
        summary: memoryNote.trim(),
        tags: ['staff-note'],
      });
      setMemoryNote('');
      await loadMemories();
      toast.success({ title: 'Saved to student AI memory' });
    } catch (err) {
      toast.error({
        title: 'Could not save memory',
        description: getApiErrorMessage(err, 'Please try again.'),
      });
    } finally {
      setSavingMemory(false);
    }
  };

  const handleCopyParentNarrative = async () => {
    if (!briefing) return;
    const text = briefing.parentNarrative[activeLang];
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success({ title: 'Parent progress summary copied' });
    } catch {
      toast.error({ title: 'Could not copy to clipboard' });
    }
  };

  const readiness = briefing ? READINESS_META[briefing.readinessStatus] : null;

  return (
    <Card className="mb-6 border-brand-200/70 bg-gradient-to-br from-white via-white to-brand-50/30 no-print">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-neutral-900">
                360° AI Academic Intelligence & Memory
              </h2>
              {readiness && <Badge variant={readiness.variant}>{readiness.label}</Badge>}
            </div>
            <p className="text-xs text-neutral-500">
              Synthesizes exam deltas, skill radar, attendance trends, dossier alerts, and institutional memory.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              openCopilot(
                `Analyze ${studentName}'s academic progress, skill logs, and recommend next upskilling steps.`,
              )
            }
          >
            <MessageSquare size={14} className="mr-1.5" />
            Ask Copilot
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={loading}
            onClick={() => void handleGenerateBriefing()}
          >
            {briefing ? (
              <>
                <RefreshCw size={14} className="mr-1.5" /> Refresh Briefing
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1.5" /> Generate 360° AI Briefing
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {!briefing && !loading && (
        <div className="py-5 text-sm text-neutral-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p>
            Click <strong>Generate 360° AI Briefing</strong> to run the Universal Orchestrator across{' '}
            <strong>{studentName}</strong>’s exams, skills, attendance, alerts, and saved memories—and
            auto-draft multilingual parent progress updates (English, Hindi, Marathi).
          </p>
        </div>
      )}

      {briefing && (
        <div className="mt-4 space-y-5">
          {/* Executive Summary */}
          <div className="p-4 rounded-xl bg-white border border-brand-100 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1">
              Executive Learner Snapshot
            </p>
            <p className="text-sm text-neutral-800 leading-relaxed">{briefing.executiveSummary}</p>
          </div>

          {/* Academic + Skills + Risk Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white border border-neutral-200/80 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Academic Trajectory
              </h3>
              <p className="text-sm font-medium text-neutral-900">
                {briefing.academicTrajectory.headline}
              </p>
              <p className="text-xs text-neutral-600">{briefing.academicTrajectory.momentumNotes}</p>
              {briefing.academicTrajectory.strengths.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-emerald-700">Strengths:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {briefing.academicTrajectory.strengths.map((s, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {briefing.academicTrajectory.growthAreas.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-amber-700">Growth Focus:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {briefing.academicTrajectory.growthAreas.map((g, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-white border border-neutral-200/80 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Skills & Holistic Development
              </h3>
              <p className="text-sm text-neutral-700 leading-relaxed">
                {briefing.skillAndBehavioralSynthesis}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-neutral-200/80 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-500" />
                Attendance & Risk Signals
              </h3>
              <p className="text-sm text-neutral-700 leading-relaxed">
                {briefing.riskSignalsAndAttendance}
              </p>
            </div>
          </div>

          {/* Staff Next Steps */}
          <div className="p-4 rounded-xl bg-white border border-neutral-200/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
              Recommended Staff Action Plan
            </h3>
            <div className="space-y-2.5">
              {briefing.staffNextSteps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-neutral-50 border border-neutral-100"
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className={`mt-0.5 shrink-0 ${
                        step.priority === 'high'
                          ? 'text-red-500'
                          : step.priority === 'medium'
                            ? 'text-amber-500'
                            : 'text-emerald-500'
                      }`}
                    />
                    <p className="text-sm text-neutral-800">{step.action}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <span className="px-2 py-0.5 rounded bg-white border border-neutral-200 text-neutral-600 font-medium">
                      {step.ownerRole}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-medium">
                      {step.timeline}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Multilingual Parent Narrative */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Languages size={16} className="text-brand-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Parent Progress Narrative
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                {(['english', 'hindi', 'marathi'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setActiveLang(lang)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                      activeLang === lang
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {lang === 'hindi' ? 'हिंदी (Hindi)' : lang === 'marathi' ? 'मराठी (Marathi)' : 'English'}
                  </button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => void handleCopyParentNarrative()}>
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed bg-white p-3.5 rounded-lg border border-slate-200/70">
              {briefing.parentNarrative[activeLang]}
            </p>
          </div>
        </div>
      )}

      {/* Institutional Entity Memory Timeline & Pinning */}
      <div className="mt-5 pt-4 border-t border-neutral-200/70">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Brain size={14} className="text-violet-600" />
            Institutional AI Memory ({memories.length})
          </h3>
          <span className="text-[11px] text-neutral-400">
            Automatically referenced by Ask EdBase AI & Career Playbooks
          </span>
        </div>

        <form onSubmit={(e) => void handleSaveMemoryNote(e)} className="flex gap-2 mb-3">
          <input
            type="text"
            value={memoryNote}
            onChange={(e) => setMemoryNote(e.target.value)}
            placeholder="Pin a staff mentoring observation to this student's long-term AI memory..."
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            isLoading={savingMemory}
            disabled={!memoryNote.trim()}
          >
            <Plus size={14} className="mr-1" /> Pin Memory
          </Button>
        </form>

        {memories.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {memories.slice(0, 6).map((m) => (
              <div
                key={m.id}
                className="px-3 py-2 rounded-lg bg-white border border-neutral-200/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
              >
                <div className="text-neutral-700">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-semibold text-[10px] uppercase mr-2">
                    {m.category.replace('_', ' ')}
                  </span>
                  {m.summary}
                </div>
                <span className="text-[10px] text-neutral-400 whitespace-nowrap">
                  {new Date(m.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
