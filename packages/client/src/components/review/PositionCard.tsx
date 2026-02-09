import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SalaryRangeBar } from '@/components/ui/salary-range-bar';
import { MultiGroupSalaryBars } from '@/components/ui/multi-group-salary-bars';
import { Equal } from 'lucide-react';
import type { EquityAnalysisWithPosition } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
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
