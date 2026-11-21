import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Play, Plus, Power } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useToast } from '../../hooks/useToast';
import { useAuthStore } from '../../store/useAuthStore';
import { getApiErrorMessage } from '../../services/api';
import {
  createAlertRule,
  evaluateAlertRulesNow,
  listAlertRules,
  updateAlertRule,
  type AlertCondition,
  type AlertMetric,
  type AlertRuleRecord,
} from '../../services/alerts.service';
import { listCenters, listPrograms } from '../../services/centers.service';
import type { CenterSummary, ProgramSummary } from '../../types';

const METRIC_LABELS: Record<AlertMetric, string> = {
  consecutive_absences: 'Consecutive Absences (sessions)',
  attendance_30d_pct: '30-Day Attendance Rate (%)',
  exam_score_drop_pct: 'Exam Score Drop Between Terms (%)',
  fee_overdue_balance: 'Outstanding Fee Balance (₹)',
};

const CONDITION_LABELS: Record<AlertCondition, string> = {
  gte: '>=',
  gt: '>',
  lte: '<=',
  lt: '<',
  eq: '=',
};

const DEFAULT_THRESHOLD_BY_METRIC: Record<AlertMetric, { condition: AlertCondition; threshold: string }> = {
  consecutive_absences: { condition: 'gte', threshold: '3' },
  attendance_30d_pct: { condition: 'lt', threshold: '75' },
  exam_score_drop_pct: { condition: 'gte', threshold: '15' },
  fee_overdue_balance: { condition: 'gte', threshold: '500' },
};

const NOTIFY_ROLE_OPTIONS = [
  { value: 'center_admin', label: 'Center Admin' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'super_admin', label: 'Super Admin' },
];

export const AlertRulesSection: React.FC = () => {
  const toast = useToast();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isGlobal = ['super_admin', 'tech_admin'].includes(currentUser?.role || '');

  const [rules, setRules] = useState<AlertRuleRecord[]>([]);
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [metric, setMetric] = useState<AlertMetric>('consecutive_absences');
  const [condition, setCondition] = useState<AlertCondition>('gte');
  const [threshold, setThreshold] = useState('3');
  const [centerId, setCenterId] = useState('');
  const [programId, setProgramId] = useState('');
  const [description, setDescription] = useState('');
  const [notifyRoles, setNotifyRoles] = useState<string[]>(['center_admin', 'supervisor']);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rList, cList, pList] = await Promise.all([
        listAlertRules(),
        listCenters(),
        listPrograms(),
      ]);
      setRules(Array.isArray(rList) ? rList : []);
      setCenters(cList);
      setPrograms(pList);
      if (!isGlobal && cList[0] && !centerId) {
        setCenterId(cList[0].id);
      }
    } catch (err) {
      toast.error({
        title: 'Could not load alert rules',
        description: getApiErrorMessage(err, 'Failed to load early-warning settings.'),
      });
    } finally {
      setLoading(false);
    }
  }, [isGlobal, centerId, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleMetricChange = (next: AlertMetric) => {
    setMetric(next);
    const preset = DEFAULT_THRESHOLD_BY_METRIC[next];
    setCondition(preset.condition);
    setThreshold(preset.threshold);
  };

  const toggleRole = (role: string) => {
    setNotifyRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (notifyRoles.length === 0) {
      toast.error({ title: 'Select at least one role to notify' });
      return;
    }
    const parsedThreshold = Number(threshold);
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
      toast.error({ title: 'Enter a valid non-negative threshold' });
      return;
    }
    setSaving(true);
    try {
      await createAlertRule({
        centerId: centerId || null,
        programId: programId || null,
        metric,
        condition,
        threshold: parsedThreshold,
        description: description.trim() || null,
        notifyRoles,
      });
      toast.success({ title: 'Early-warning rule created' });
      setShowCreate(false);
      setDescription('');
      await loadAll();
    } catch (err) {
      toast.error({
        title: 'Failed to create rule',
        description: getApiErrorMessage(err, 'Could not save rule.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (rule: AlertRuleRecord) => {
    try {
      await updateAlertRule(rule.id, { isActive: !rule.isActive });
      toast.success({
        title: rule.isActive ? 'Rule paused' : 'Rule activated',
      });
      await loadAll();
    } catch (err) {
      toast.error({
        title: 'Update failed',
        description: getApiErrorMessage(err, 'Could not update rule status.'),
      });
    }
  };

  const handleEvaluateNow = async () => {
    setEvaluating(true);
    try {
      const res = await evaluateAlertRulesNow();
      toast.success({
        title: 'Risk evaluation complete',
        description: `Checked ${res.evaluatedStudents} student(s) against ${res.evaluatedRules} rule(s); created ${res.createdAlerts} new alert(s).`,
      });
      await loadAll();
    } catch (err) {
      toast.error({
        title: 'Evaluation failed',
        description: getApiErrorMessage(err, 'Could not evaluate rules.'),
      });
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-neutral-900 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            Early-Warning Dropout &amp; Academic Risk Rules
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Automatically evaluates students nightly (23:59 UTC) and raises actionable dashboard alerts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            isLoading={evaluating}
            onClick={() => void handleEvaluateNow()}
          >
            <Play size={14} className="mr-1.5" /> Run Check Now
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus size={14} className="mr-1.5" /> {showCreate ? 'Cancel' : 'Add Rule'}
          </Button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreateRule}
          className="mb-5 p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Risk Metric</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={metric}
                onChange={(e) => handleMetricChange(e.target.value as AlertMetric)}
              >
                {(Object.keys(METRIC_LABELS) as AlertMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Condition</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={condition}
                onChange={(e) => setCondition(e.target.value as AlertCondition)}
              >
                <option value="gte">&gt;= (At least)</option>
                <option value="gt">&gt; (Greater than)</option>
                <option value="lte">&lt;= (At most)</option>
                <option value="lt">&lt; (Below)</option>
                <option value="eq">= (Equal to)</option>
              </select>
            </div>
            <Input
              label="Threshold"
              type="number"
              min="0"
              step="any"
              required
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Center Scope</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={centerId}
                onChange={(e) => setCenterId(e.target.value)}
              >
                {isGlobal && <option value="">All Centers (Global Rule)</option>}
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Program Scope (optional)
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
              >
                <option value="">All Programs</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Description (optional)"
            placeholder="e.g. Flag chronic absenteeism before dropout"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div>
            <p className="text-xs font-medium text-neutral-700 mb-1.5">Notify Roles</p>
            <div className="flex flex-wrap gap-3">
              {NOTIFY_ROLE_OPTIONS.map((opt) => (
                <label key={opt.value} className="inline-flex items-center gap-1.5 text-xs text-neutral-700">
                  <input
                    type="checkbox"
                    checked={notifyRoles.includes(opt.value)}
                    onChange={() => toggleRole(opt.value)}
                    className="rounded border-neutral-300"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              Save Alert Rule
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingSpinner label="Loading alert rules…" />
      ) : rules.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4 text-center">
          No early-warning rules configured yet. Add one above to monitor absenteeism, score drops, or overdue fees.
        </p>
      ) : (
        <div className="space-y-2.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-neutral-200 bg-white"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-neutral-900">
                    {METRIC_LABELS[rule.metric] ?? rule.metric}
                  </span>
                  <Badge variant="neutral">
                    {CONDITION_LABELS[rule.condition] ?? rule.condition} {String(rule.threshold)}
                  </Badge>
                  <Badge variant={rule.isActive ? 'success' : 'neutral'}>
                    {rule.isActive ? 'Active' : 'Paused'}
                  </Badge>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {rule.center?.name ?? 'All Centers'} · {rule.program?.name ?? 'All Programs'} ·
                  Notify: {rule.notifyRoles.join(', ')}
                  {rule.description ? ` — ${rule.description}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleToggleRule(rule)}
              >
                <Power size={14} className="mr-1.5" />
                {rule.isActive ? 'Pause' : 'Activate'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
