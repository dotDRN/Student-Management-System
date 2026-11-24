import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Target,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import {
  generateStudentCareerPlaybook,
  type CareerUpskillingPlaybook,
} from '../../services/ai.service';
import { getApiErrorMessage } from '../../services/api';

interface CareerAiGuidancePanelProps {
  studentId: string;
  studentName: string;
  onApplyPathway: (pathway: {
    careerGoal: string;
    industry: string;
    notes: string;
    milestones: string[];
  }) => Promise<void>;
}

export const CareerAiGuidancePanel: React.FC<CareerAiGuidancePanelProps> = ({
  studentId,
  studentName,
  onApplyPathway,
}) => {
  const [playbook, setPlaybook] = useState<CareerUpskillingPlaybook | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [customGoal, setCustomGoal] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlaybook(null);
    setError(null);
    setCustomGoal('');
  }, [studentId]);

  const handleGenerate = async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateStudentCareerPlaybook(studentId, {
        ...(customGoal.trim() ? { customGoal: customGoal.trim() } : {}),
      });
      setPlaybook(res);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not generate AI skill & career playbook.'));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (idx: number) => {
    if (!playbook) return;
    const p = playbook.recommendedPathways[idx];
    if (!p) return;
    setApplyingIdx(idx);
    try {
      await onApplyPathway({
        careerGoal: p.careerGoal,
        industry: p.industry,
        notes: `${p.rationale} ${p.suggestedNotes}`.trim(),
        milestones: p.targetMilestones,
      });
    } finally {
      setApplyingIdx(null);
    }
  };

  return (
    <Card className="mt-6 border-brand-200/70 bg-gradient-to-br from-white via-white to-violet-50/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-brand-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              AI Skill & Career Guidance Playbook (Staff Upskilling Procedure)
            </h2>
            <p className="text-xs text-neutral-500">
              Generates personalized career pathways & step-by-step 30-60-90 day staff procedures to upskill{' '}
              <span className="font-medium text-neutral-700">{studentName}</span>.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            placeholder="Optional focus (e.g. IT Support, Nursing)..."
            className="sm:w-60 h-9 text-xs"
          />
          <Button
            variant="primary"
            size="sm"
            isLoading={loading}
            onClick={() => void handleGenerate()}
          >
            {playbook ? (
              <>
                <RefreshCw size={14} className="mr-1.5" /> Regenerate Playbook
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1.5" /> Generate AI Playbook
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

      {!playbook && !loading && (
        <div className="py-5 text-sm text-neutral-600">
          Use the Universal AI Orchestrator to analyze <strong>{studentName}</strong>’s program,
          exam subject performance, and 1–5 skill matrix logs into a clear <strong>30-60-90 day staff upskilling procedure</strong> and recommended career pathways you can apply in one click.
        </div>
      )}

      {playbook && (
        <div className="mt-5 space-y-6">
          {/* Diagnosis Banner */}
          <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700">
                Learner Readiness Diagnosis · {playbook.programName}
              </span>
              <Badge
                variant={
                  playbook.learnerDiagnosis.academicReadinessLevel === 'career_ready'
                    ? 'success'
                    : playbook.learnerDiagnosis.academicReadinessLevel === 'developing'
                      ? 'primary'
                      : 'warning'
                }
              >
                {playbook.learnerDiagnosis.academicReadinessLevel.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            <p className="text-sm text-neutral-700 leading-relaxed">
              {playbook.learnerDiagnosis.summary}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-neutral-100">
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase mb-1">
                  Top Strengths
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {playbook.learnerDiagnosis.topStrengths.map((s, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-amber-700 uppercase mb-1">
                  Priority Skill Gaps to Coach
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {playbook.learnerDiagnosis.prioritySkillGaps.map((g, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3 Recommended Career / Developmental Pathways */}
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 mb-3">
              <Target size={16} className="text-brand-600" />
              Recommended Pathways (One-Click Apply to Career Record)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {playbook.recommendedPathways.map((path, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-white border border-neutral-200 flex flex-col justify-between shadow-2xs hover:border-brand-300 transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-neutral-900 text-sm">
                          {path.careerGoal}
                        </h4>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 mt-0.5">
                          {path.industry}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        {path.fitScore}% Fit
                      </span>
                    </div>

                    <p className="text-xs text-neutral-600 mt-2.5 leading-relaxed">
                      {path.rationale}
                    </p>

                    <div className="mt-3 space-y-1">
                      <p className="text-[11px] font-semibold text-neutral-500 uppercase">
                        Target Milestones
                      </p>
                      {path.targetMilestones.map((m, mIdx) => (
                        <div key={mIdx} className="flex items-start gap-1.5 text-xs text-neutral-700">
                          <CheckCircle2 size={13} className="text-brand-500 mt-0.5 shrink-0" />
                          <span>{m}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full mt-4"
                    isLoading={applyingIdx === idx}
                    onClick={() => void handleApply(idx)}
                  >
                    Apply to Career History <ArrowRight size={13} className="ml-1.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* 30-60-90 Day Staff Upskilling Procedure */}
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 mb-3">
              <ClipboardList size={16} className="text-violet-600" />
              Step-by-Step Staff Upskilling Procedure (30 / 60 / 90 Days)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                { key: '30d', badge: '30 Days', phase: playbook.staffUpskillingProcedure.phase30Days },
                { key: '60d', badge: '60 Days', phase: playbook.staffUpskillingProcedure.phase60Days },
                { key: '90d', badge: '90 Days', phase: playbook.staffUpskillingProcedure.phase90Days },
              ].map(({ key, badge, phase }) => (
                <div
                  key={key}
                  className="p-4 rounded-xl bg-white border border-neutral-200 space-y-2.5"
                >
                  <span className="inline-block px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded bg-violet-50 text-violet-700 border border-violet-200">
                    {badge}
                  </span>
                  <h4 className="text-sm font-semibold text-neutral-900">{phase.title}</h4>
                  <p className="text-xs text-neutral-500">{phase.objective}</p>
                  <ol className="space-y-2 pt-1">
                    {phase.staffSteps.map((step, sIdx) => (
                      <li key={sIdx} className="flex items-start gap-2 text-xs text-neutral-700">
                        <span className="h-4 w-4 rounded-full bg-neutral-100 text-neutral-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {sIdx + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>

          {/* Targeted Skill Drills */}
          {playbook.recommendedSkillDrills.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 mb-3">
                <Dumbbell size={16} className="text-emerald-600" />
                Targeted Skill Coaching Drills for Teachers
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {playbook.recommendedSkillDrills.map((drill, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-white border border-neutral-200 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-neutral-900">
                        {drill.skillName}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                        L{drill.currentLevel} → L{drill.targetLevel}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      {drill.staffFacilitationProcedure}
                    </p>
                    <p className="text-[11px] font-medium text-neutral-500">
                      Cadence: {drill.frequency}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
