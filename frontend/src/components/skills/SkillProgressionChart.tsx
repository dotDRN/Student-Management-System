import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SkillRecord } from '../../types';
import { formatDate } from '../../utils/date';

const LINE_PALETTE = [
  '#b91c1c',
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#be185d',
];

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

interface SkillProgressionChartProps {
  records: SkillRecord[];
  title?: string;
  heightClassName?: string;
}

export const SkillProgressionChart: React.FC<SkillProgressionChartProps> = ({
  records,
  title = 'Skill Progression Over Time (%)',
  heightClassName = 'h-64',
}) => {
  const { series, skillNames } = useMemo(() => {
    if (!records || records.length === 0) {
      return { series: [] as Array<Record<string, string | number>>, skillNames: [] as string[] };
    }

    const byDate = new Map<string, Map<string, { pct: number; raw: string }>>();
    const skillSet = new Set<string>();

    for (const rec of records) {
      const skillName = rec.skill?.name ?? rec.skillName;
      if (!skillName || typeof rec.level !== 'number') continue;

      const rawDate = rec.assessedOn ? String(rec.assessedOn) : '';
      const dateMatch = ISO_DATE_PREFIX.exec(rawDate);
      const dateKey = dateMatch
        ? dateMatch[1]
        : rawDate
          ? formatDate(rawDate, 'yyyy-MM-dd')
          : '';
      if (!dateKey || dateKey === 'Invalid Date') continue;

      const maxLevel = rec.skill?.maxLevel && rec.skill.maxLevel > 0 ? rec.skill.maxLevel : 5;
      const pct = Math.min(100, Math.max(0, Math.round((rec.level / maxLevel) * 100)));

      skillSet.add(skillName);
      const dateBucket = byDate.get(dateKey) ?? new Map<string, { pct: number; raw: string }>();
      // Records arrive newest-first; keep the first encountered value per skill on a date.
      if (!dateBucket.has(skillName)) {
        dateBucket.set(skillName, { pct, raw: `${rec.level}/${maxLevel} (${pct}%)` });
      }
      byDate.set(dateKey, dateBucket);
    }

    const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
    const names = Array.from(skillSet).sort((a, b) => a.localeCompare(b));

    const data = sortedDates.map((dateKey) => {
      const point: Record<string, string | number> = {
        dateKey,
        label: formatDate(dateKey, 'MMM d, yyyy'),
      };
      const bucket = byDate.get(dateKey)!;
      for (const name of names) {
        const entry = bucket.get(name);
        if (entry) {
          point[name] = entry.pct;
          point[`${name}__raw`] = entry.raw;
        }
      }
      return point;
    });

    return { series: data, skillNames: names };
  }, [records]);

  if (series.length === 0 || skillNames.length === 0) {
    return null;
  }

  if (series.length < 2) {
    return (
      <div className="mt-4 pt-4 border-t border-neutral-100">
        <p className="text-xs font-medium text-neutral-600 mb-1">{title}</p>
        <p className="text-xs text-neutral-500">
          Assessments currently exist on 1 date ({series[0].label}). Record assessments on another date to plot longitudinal progression.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-neutral-100">
      <h3 className="text-sm font-semibold text-neutral-800 mb-2">{title}</h3>
      <div className={`${heightClassName} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name, item) => {
                const payload = item?.payload as Record<string, string | number> | undefined;
                const key = typeof name === 'string' ? name : String(name ?? '');
                const rawText = payload?.[`${key}__raw`];
                if (typeof rawText === 'string') {
                  return [rawText, key];
                }
                return [`${value ?? 0}%`, key];
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {skillNames.map((name, idx) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={LINE_PALETTE[idx % LINE_PALETTE.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
