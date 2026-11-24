import React, { useCallback, useEffect, useState } from 'react';
import { CalendarRange, CheckCircle2, Plus } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useToast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../services/api';
import {
  createAcademicYear,
  listAcademicYears,
  setCurrentAcademicYear,
  type AcademicYearRecord,
} from '../../services/academicYears.service';
import { formatDate } from '../../utils/date';

export const AcademicYearsSection: React.FC = () => {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYearRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);

  const loadYears = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAcademicYears();
      setYears(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error({
        title: 'Could not load academic years',
        description: getApiErrorMessage(err, 'Failed to load academic year definitions.'),
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadYears();
  }, [loadYears]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !startDate || !endDate) {
      toast.error({
        title: 'Missing details',
        description: 'Enter academic year label, start date, and end date.',
      });
      return;
    }

    setSaving(true);
    try {
      await createAcademicYear({
        label: label.trim(),
        startDate,
        endDate,
        isCurrent,
      });
      toast.success({ title: `Academic year ${label.trim()} created` });
      setLabel('');
      setStartDate('');
      setEndDate('');
      setIsCurrent(false);
      setShowCreate(false);
      await loadYears();
    } catch (err) {
      toast.error({
        title: 'Could not create academic year',
        description: getApiErrorMessage(err, 'Verify label uniqueness and date range.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSetCurrent = async (year: AcademicYearRecord) => {
    setSwitchingId(year.id);
    try {
      await setCurrentAcademicYear(year.id);
      toast.success({ title: `${year.label} is now the active academic year` });
      await loadYears();
    } catch (err) {
      toast.error({
        title: 'Could not switch academic year',
        description: getApiErrorMessage(err, 'Please try again.'),
      });
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <CalendarRange size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Academic Years & Lifecycle</h2>
            <p className="text-sm text-neutral-500">
              Define annual session windows and control the active year used for enrollments, exams, and cohort transitions.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant={showCreate ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => setShowCreate((prev) => !prev)}
        >
          <Plus size={15} className="mr-1.5" />
          {showCreate ? 'Cancel' : 'New Academic Year'}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mb-5 p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Year Label"
              placeholder="e.g. 2026-27"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isCurrent}
                onChange={(e) => setIsCurrent(e.target.checked)}
                className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
              />
              Set as active current academic year immediately
            </label>

            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              Create Academic Year
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : years.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4 text-center">
          No academic years configured yet. Create your first academic session window above.
        </p>
      ) : (
        <div className="space-y-2.5">
          {years.map((year) => (
            <div
              key={year.id}
              className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border ${
                year.isCurrent
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-neutral-200 bg-white'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">{year.label}</span>
                  {year.isCurrent && <Badge variant="success">Current</Badge>}
                </div>
                <p className="text-xs text-neutral-500">
                  {formatDate(year.startDate)} – {formatDate(year.endDate)}
                </p>
                {year._count && (
                  <div className="flex flex-wrap gap-3 text-xs text-neutral-600 pt-0.5">
                    <span>{year._count.students} students</span>
                    <span>•</span>
                    <span>{year._count.attendanceSessions} attendance sessions</span>
                    <span>•</span>
                    <span>{year._count.exams} exams</span>
                  </div>
                )}
              </div>

              {!year.isCurrent ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={switchingId === year.id}
                  onClick={() => void handleSetCurrent(year)}
                >
                  <CheckCircle2 size={14} className="mr-1.5" />
                  Set Current
                </Button>
              ) : (
                <span className="text-xs font-medium text-emerald-700 px-2.5 py-1 rounded-lg bg-emerald-100/70">
                  Active Session
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
