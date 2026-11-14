import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Play } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { getApiErrorMessage } from '../../services/api';
import {
  evaluateAlertRulesNow,
  listAlerts,
  updateAlertStatus,
  type AlertRecord,
} from '../../services/alerts.service';
import { formatDate } from '../../utils/date';

export const RiskAlertsCard: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermission();
  const canEvaluate = can('manage', 'centers');

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAlerts({ status: statusFilter, limit: 25 });
      setAlerts(res.alerts ?? []);
      setOpenCount(res.openCount ?? 0);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const handleAcknowledge = async (alertId: string, nextRead: boolean) => {
    try {
      await updateAlertStatus(alertId, nextRead);
      toast.success({ title: nextRead ? 'Alert acknowledged' : 'Alert reopened' });
      await loadAlerts();
    } catch (err) {
      toast.error({
        title: 'Could not update alert',
        description: getApiErrorMessage(err, 'Try again.'),
      });
    }
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const summary = await evaluateAlertRulesNow();
      toast.success({
        title: 'Risk check finished',
        description: `${summary.createdAlerts} new alert(s) created across ${summary.evaluatedStudents} student(s).`,
      });
      await loadAlerts();
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
    <Card className="border border-neutral-200/80 shadow-sm mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-neutral-900">Early-Warning Risk Alerts</h3>
              <Badge variant={openCount > 0 ? 'warning' : 'success'}>
                {openCount} open
              </Badge>
            </div>
            <p className="text-xs text-neutral-500">
              Students flagged by attendance, exam score drop, or overdue fee rules
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className={`px-2.5 py-1 rounded-md font-medium ${statusFilter === 'open' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'}`}
            >
              Open Only
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium ${statusFilter === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'}`}
            >
              All
            </button>
          </div>
          {canEvaluate && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={evaluating}
              onClick={() => void handleEvaluate()}
            >
              <Play size={13} className="mr-1.5" /> Run Check
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label="Checking active alerts…" />
      ) : alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500 py-4">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>No {statusFilter === 'open' ? 'open ' : ''}early-warning risk alerts right now.</span>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border ${
                alert.isRead
                  ? 'bg-neutral-50 border-neutral-100 opacity-75'
                  : 'bg-amber-50/40 border-amber-200/80'
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  {alert.student ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/students/${alert.student!.id}`)}
                      className="text-sm font-semibold text-brand-700 hover:underline"
                    >
                      {alert.student.fullName}
                    </button>
                  ) : (
                    <span className="text-sm font-semibold text-neutral-800">Student Alert</span>
                  )}
                  {alert.center?.name && (
                    <span className="text-xs text-neutral-500">· {alert.center.name}</span>
                  )}
                  <span className="text-[11px] text-neutral-400">
                    {formatDate(alert.createdAt, 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-xs text-neutral-700">{alert.message}</p>
              </div>
              <Button
                variant={alert.isRead ? 'ghost' : 'secondary'}
                size="sm"
                className="shrink-0"
                onClick={() => void handleAcknowledge(alert.id, !alert.isRead)}
              >
                {alert.isRead ? 'Reopen' : 'Acknowledge'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
