import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SalaryRangeBar } from '@/components/ui/salary-range-bar';
import { MultiGroupSalaryBars } from '@/components/ui/multi-group-salary-bars';
import { Equal, History, TrendingUp, Info } from 'lucide-react';
import type { EquityAnalysisWithPosition } from '@cupa/shared';
import { equityAnalysisApi } from '@/services/api';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

interface SalaryHistoryRecord {
  dataYear: string;
  currentSalary: number | null;
  equityGap: number | null;
  proposedRaise: number | null;
  actualRaiseGiven: number | null;
}

interface PositionCardProps {
  pos: EquityAnalysisWithPosition;
  effectiveRaise: number;
  editingRaise: string;
  savingRaise: boolean;
  onRaiseChange: (value: string) => void;
  onRaiseBlur: () => void;
  feedbackSlot?: React.ReactNode;
}

export function PositionCard({
  pos,
  effectiveRaise,
  editingRaise,
  savingRaise,
  onRaiseChange,
  onRaiseBlur,
  feedbackSlot,
}: PositionCardProps) {
  const [history, setHistory] = useState<SalaryHistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const percentOfMedian =
    pos.currentSalary && pos.adjustedMedian
      ? (pos.currentSalary / pos.adjustedMedian) * 100
      : null;
  const isUnderpaid = percentOfMedian !== null && percentOfMedian < 95;
  const isOverpaid = percentOfMedian !== null && percentOfMedian > 105;
  const newSalary =
    pos.currentSalary && effectiveRaise > 0 ? pos.currentSalary + effectiveRaise : pos.currentSalary;
  const remainingGap =
    pos.equityGap !== null && effectiveRaise > 0 ? pos.equityGap - effectiveRaise : pos.equityGap;

  // Calculate total previous raises
  const totalPreviousRaises = history.reduce((sum, h) => {
    return sum + (h.actualRaiseGiven || 0);
  }, 0);

  // Categorize prior adjustments
  const hasSignificantPriorRaise = history.some(h => 
    h.actualRaiseGiven && h.actualRaiseGiven > 5000
  );
  
  const hasModestPriorRaise = !hasSignificantPriorRaise && history.some(h =>
    h.actualRaiseGiven && h.actualRaiseGiven > 0
  );
  
  const mostRecentRaise = history.length > 0 ? history[0] : null;

  async function loadHistory() {
    if (history.length > 0) return; // Already loaded
    setHistoryLoading(true);
    try {
      const data = await equityAnalysisApi.getEmployeeHistory(pos.employeeId);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load employee history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Auto-load history when card is rendered (for VP context)
  useEffect(() => {
    loadHistory();
  }, [pos.employeeId]);

  return (
    <Card
      className={
        isUnderpaid
          ? 'border-l-4 border-l-red-500'
          : isOverpaid
            ? 'border-l-4 border-l-green-500'
            : 'border-l-4 border-l-blue-500'
      }
    >
      <CardContent className="p-4">
        {/* Prior Raise Alert Banner - Significant (>$5k) */}
        {hasSignificantPriorRaise && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-amber-900">
                  Prior Equity Adjustments: {formatCurrency(totalPreviousRaises)}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-amber-700 hover:text-amber-900"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? 'Hide' : 'Show'} History
                </Button>
              </div>
              {showHistory && history.length > 0 && (
                <div className="mt-2 space-y-1">
                  {history.map((h, idx) => (
                    h.actualRaiseGiven && h.actualRaiseGiven > 0 ? (
                      <div key={idx} className="flex items-center justify-between text-xs text-amber-800">
                        <span className="font-medium">{h.dataYear}:</span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {formatCurrency(h.actualRaiseGiven)}
                        </span>
                      </div>
                    ) : null
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Prior Raise Info Badge - Modest (<$5k) - More subtle */}
        {hasModestPriorRaise && (
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              <History className="h-3 w-3 mr-1" />
              Prior raise: {formatCurrency(totalPreviousRaises)}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? 'Hide' : 'Details'}
            </Button>
            {showHistory && history.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {history.map((h, idx) => (
                  h.actualRaiseGiven && h.actualRaiseGiven > 0 ? (
                    <span key={idx} className="flex items-center gap-1">
                      <span className="font-medium">{h.dataYear}:</span>
                      {formatCurrency(h.actualRaiseGiven)}
                    </span>
                  ) : null
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-12 gap-4 items-center">
          {/* Employee Info - 3 cols */}
          <div className="col-span-3">
            <div className="font-semibold">{pos.employeeName}</div>
            <div className="text-sm text-muted-foreground">{pos.institutionalTitle}</div>
            <div className="text-xs text-muted-foreground">{pos.department}</div>
          </div>

          {/* CUPA Info - 2 cols */}
          <div className="col-span-2">
            {pos.cupaCode ? (
              <>
                <div className="font-mono text-xs text-muted-foreground">{pos.cupaCode}</div>
                <div className="text-xs truncate" title={pos.cupaTitle || ''}>
                  {pos.cupaTitle}
                </div>
              </>
            ) : (
              <Badge variant="outline" className="text-xs">
                No CUPA Code
              </Badge>
            )}
          </div>

          {/* Range Bar - 3 cols */}
          <div className="col-span-3">
            <SalaryRangeBar
              currentSalary={pos.totalCompensation || pos.currentSalary}
              adjustedMedian={pos.adjustedMedian}
              baseMedian={pos.baseMedian}
              proposedRaise={effectiveRaise || null}
              showLabels
            />
          </div>

          {/* Salary Numbers & Raise Input - 4 cols */}
          <div className="col-span-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Current:</span>
                  <span className="font-mono">{formatCurrency(pos.currentSalary)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Target:</span>
                  <span className="font-mono">{formatCurrency(pos.adjustedMedian)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Gap:</span>
                  <span
                    className={
                      pos.equityGap && pos.equityGap > 0 ? 'text-red-600' : 'text-green-600'
                    }
                  >
                    {formatCurrency(pos.equityGap)}
                  </span>
                </div>
              </div>

              {/* Proposed Raise Input */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Proposed Raise:</div>
                <div className="flex gap-1">
                  <Input
                    type="text"
                    placeholder="$0"
                    value={editingRaise}
                    onChange={(e) => onRaiseChange(e.target.value)}
                    onBlur={onRaiseBlur}
                    className={`h-7 text-xs font-mono ${savingRaise ? 'opacity-50' : ''}`}
                    disabled={savingRaise}
                  />
                  {pos.equityGap !== null && pos.equityGap > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-1.5 flex-shrink-0 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/30"
                      title={`True up to median: set raise to ${formatCurrency(pos.equityGap)}`}
                      onClick={() => onRaiseChange(String(Math.round(pos.equityGap! * 100) / 100))}
                      disabled={savingRaise}
                    >
                      <Equal className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {effectiveRaise > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">New: </span>
                    <span className="font-mono text-blue-600">{formatCurrency(newSalary)}</span>
                    <span className="text-muted-foreground ml-2">Gap: </span>
                    <span
                      className={`font-mono ${remainingGap && remainingGap > 0 ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {formatCurrency(remainingGap)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Multi-group comparison bars */}
        {pos.cupaCode && (
          <div className="mt-3 pt-3 border-t">
            <MultiGroupSalaryBars
              cupaCode={pos.cupaCode}
              currentSalary={pos.totalCompensation || pos.currentSalary}
              fte={pos.fte}
              appointmentMonths={pos.appointmentMonths}
              proposedRaise={effectiveRaise > 0 ? effectiveRaise : null}
            />
          </div>
        )}

        {/* Badges row */}
        <div className="mt-2 pt-2 border-t flex flex-wrap gap-1 items-center">
          <Badge variant="secondary" className="text-xs">
            {pos.compensationType}
          </Badge>
          {pos.fte < 1 && (
            <Badge variant="outline" className="text-xs">
              {(pos.fte * 100).toFixed(0)}% FTE
            </Badge>
          )}
          {pos.appointmentMonths < 12 && (
            <Badge variant="outline" className="text-xs">
              {pos.appointmentMonths}-month
            </Badge>
          )}
          {pos.hasHousingBenefit && (
            <Badge
              variant="outline"
              className="text-xs bg-blue-50 text-blue-700 border-blue-200"
            >
              Housing Benefit
            </Badge>
          )}
          {feedbackSlot && <div className="ml-auto flex items-center gap-1">{feedbackSlot}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
