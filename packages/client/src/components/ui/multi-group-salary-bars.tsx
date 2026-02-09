import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { equityAnalysisApi } from '@/services/api';

interface ComparisonData {
  comparison_group: string;
  median_salary: number;
}

interface MultiGroupSalaryBarsProps {
  cupaCode: string | null;
  currentSalary: number | null;
  fte?: number;
  appointmentMonths?: number;
  proposedRaise?: number | null;
  className?: string;
}

const GROUP_COLORS: Record<string, { fill: string; marker: string; label: string }> = {
  Moravian:      { fill: 'bg-violet-200 dark:bg-violet-900/40', marker: 'bg-violet-500', label: 'text-violet-700 dark:text-violet-300' },
  Budget:        { fill: 'bg-blue-200 dark:bg-blue-900/40',     marker: 'bg-blue-500',   label: 'text-blue-700 dark:text-blue-300' },
  'Student FTE': { fill: 'bg-cyan-200 dark:bg-cyan-900/40',     marker: 'bg-cyan-500',   label: 'text-cyan-700 dark:text-cyan-300' },
  Landmark:      { fill: 'bg-amber-200 dark:bg-amber-900/40',   marker: 'bg-amber-500',  label: 'text-amber-700 dark:text-amber-300' },
  NACU:          { fill: 'bg-emerald-200 dark:bg-emerald-900/40', marker: 'bg-emerald-500', label: 'text-emerald-700 dark:text-emerald-300' },
  'Staff FTE':   { fill: 'bg-rose-200 dark:bg-rose-900/40',     marker: 'bg-rose-500',   label: 'text-rose-700 dark:text-rose-300' },
};

const DEFAULT_COLORS = { fill: 'bg-gray-200 dark:bg-gray-800', marker: 'bg-gray-500', label: 'text-gray-700 dark:text-gray-300' };

function getColors(group: string) {
  return GROUP_COLORS[group] || DEFAULT_COLORS;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

/**
 * Renders one salary range bar per comparison group for a given CUPA code.
 * Each bar shows where the employee's salary falls relative to that group's median.
 */
export function MultiGroupSalaryBars({
  cupaCode,
  currentSalary,
  fte = 1,
  appointmentMonths = 12,
  proposedRaise,
  className,
}: MultiGroupSalaryBarsProps) {
  const [groups, setGroups] = useState<ComparisonData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cupaCode) return;
    setLoading(true);
    equityAnalysisApi
      .getSalaryComparisons([cupaCode])
      .then((data) => setGroups(data.filter((d) => d.cupa_code === cupaCode)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [cupaCode]);

  if (!cupaCode || !currentSalary) {
    return (
      <div className={cn('p-3 bg-muted/30 rounded-lg text-center', className)}>
        <span className="text-xs text-muted-foreground">No salary comparison data</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn('p-3 bg-muted/30 rounded-lg', className)}>
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className={cn('p-3 bg-muted/30 rounded-lg text-center', className)}>
        <span className="text-xs text-muted-foreground">No comparison group data for this CUPA code</span>
      </div>
    );
  }

  // Adjust medians the same way equity calculator does (FTE + appointment months)
  const adjustMedian = (baseMedian: number) => {
    let adjusted = baseMedian;
    if (appointmentMonths < 12) {
      adjusted = adjusted * (appointmentMonths / 12);
    }
    if (fte < 1) {
      adjusted = adjusted * fte;
    }
    return adjusted;
  };

  const newSalary = proposedRaise && proposedRaise > 0 ? currentSalary + proposedRaise : null;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header row with scale */}
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
        <div className="w-24 flex-shrink-0" />
        <div className="flex-1 flex justify-between px-0.5">
          <span>50%</span>
          <span>75%</span>
          <span className="font-medium">100%</span>
          <span>125%</span>
          <span>150%</span>
        </div>
        <div className="w-16 flex-shrink-0" />
      </div>

      {groups.map((g) => {
        const colors = getColors(g.comparison_group);
        const adjustedMedian = adjustMedian(g.median_salary);
        const pct = (currentSalary / adjustedMedian) * 100;
        const newPct = newSalary ? (newSalary / adjustedMedian) * 100 : null;

        const minRange = 50;
        const maxRange = 150;
        const rangeSpan = maxRange - minRange;
        const barPos = Math.max(0, Math.min(100, ((pct - minRange) / rangeSpan) * 100));
        const newBarPos = newPct
          ? Math.max(0, Math.min(100, ((newPct - minRange) / rangeSpan) * 100))
          : null;

        const isUnderpaid = pct < 95;

        return (
          <div key={g.comparison_group} className="flex items-center gap-2">
            {/* Group label */}
            <div className={cn('w-24 flex-shrink-0 text-xs font-medium text-right truncate', colors.label)}>
              {g.comparison_group}
            </div>

            {/* Bar */}
            <div
              className="flex-1 relative h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"
              title={`${g.comparison_group}: ${formatCurrency(currentSalary)} vs median ${formatCurrency(adjustedMedian)} (${pct.toFixed(0)}%)`}
            >
              {/* Fill */}
              <div
                className={cn('absolute left-0 top-0 h-full transition-all', colors.fill)}
                style={{ width: `${barPos}%` }}
              />

              {/* Proposed raise segment */}
              {newBarPos && newBarPos > barPos && (
                <div
                  className="absolute top-0 h-full bg-emerald-400/60 dark:bg-emerald-500/40"
                  style={{ left: `${barPos}%`, width: `${newBarPos - barPos}%` }}
                />
              )}

              {/* 75% marker */}
              <div className="absolute top-0 h-full w-px bg-gray-300 dark:bg-gray-600" style={{ left: '25%' }} />
              {/* Median marker (100%) */}
              <div className="absolute top-0 h-full w-0.5 bg-gray-500 dark:bg-gray-400" style={{ left: '50%' }} />
              {/* 125% marker */}
              <div className="absolute top-0 h-full w-px bg-gray-300 dark:bg-gray-600" style={{ left: '75%' }} />

              {/* New salary marker */}
              {newBarPos && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-md bg-emerald-500"
                  style={{ left: `calc(${newBarPos}% - 6px)` }}
                />
              )}

              {/* Current salary marker */}
              <div
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-md transition-all',
                  colors.marker
                )}
                style={{ left: `calc(${barPos}% - 6px)` }}
              />

              {/* Percentage label */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={cn(
                    'text-[10px] font-bold',
                    isUnderpaid ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'
                  )}
                >
                  {pct.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Median value */}
            <div className="w-16 flex-shrink-0 text-[10px] text-muted-foreground text-right tabular-nums">
              {formatCurrency(adjustedMedian)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
