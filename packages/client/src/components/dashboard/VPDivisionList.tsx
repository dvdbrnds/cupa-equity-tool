import { useNavigate } from 'react-router-dom';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EquitySummaryByVp, EquityAnalysisSummary } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

interface VPDivisionListProps {
  vpSummary: EquitySummaryByVp[];
  summary: EquityAnalysisSummary | null;
  vpAllocations?: Record<
    string,
    { allocated: number; supplemental: number | null; status: string | null }
  >;
}

export function VPDivisionList({ vpSummary, summary, vpAllocations = {} }: VPDivisionListProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gap by VP Division</CardTitle>
        <CardDescription>Click a division to see individual positions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {vpSummary.map((vp) => {
            const gapPercentOfTotal =
              summary && summary.totalGap > 0 ? (vp.totalGap / summary.totalGap) * 100 : 0;

            return (
              <div
                key={vp.vpStem}
                className="p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 cursor-pointer transition-colors group"
                onClick={() =>
                  navigate(`/divisions/${encodeURIComponent(vp.vpStem)}`)
                }
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium text-lg flex items-center gap-2">
                        {vp.vpTitle || vp.vpStem}
                        {vpAllocations[vp.vpStem]?.status === 'finalized' && (
                          <Badge className="bg-green-600 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        )}
                        {vpAllocations[vp.vpStem]?.status === 'approved' && (
                          <Badge
                            variant="outline"
                            className="text-xs border-blue-300 text-blue-600"
                          >
                            VP Approved
                          </Badge>
                        )}
                        {vpAllocations[vp.vpStem]?.status === 'in_review' && (
                          <Badge variant="outline" className="text-xs">
                            In Review
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {vp.analyzedCount} of {vp.positionCount} analyzed{' '}
                        &bull;{' '}
                        <span className="text-blue-600">{vp.salariedCount} salaried</span>
                        {' '}&bull;{' '}
                        <span className="text-purple-600">{vp.hourlyCount} hourly</span>
                      </div>
                      {vpAllocations[vp.vpStem] && (
                        <div className="text-sm text-green-600 font-medium">
                          Allocated: {formatCurrency(vpAllocations[vp.vpStem].allocated || 0)}
                          {vpAllocations[vp.vpStem].supplemental &&
                            vpAllocations[vp.vpStem].supplemental! > 0 && (
                              <span className="text-blue-600">
                                {' '}
                                (+{formatCurrency(vpAllocations[vp.vpStem].supplemental!)} VP
                                offer)
                              </span>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-red-600 text-lg">
                        {formatCurrency(vp.totalGap)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Avg: {formatCurrency(vp.averageGap)} (
                        {formatPercent(vp.averageGapPercentage)})
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all"
                      style={{ width: `${Math.min(100, gapPercentOfTotal)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {formatPercent(gapPercentOfTotal)}
                  </span>
                </div>
              </div>
            );
          })}

          {vpSummary.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No VP division data available
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
