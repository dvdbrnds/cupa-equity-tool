import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, User, Building, Clock, DollarSign, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { SalaryRangeBar } from '@/components/ui/salary-range-bar';
import { MultiGroupSalaryBars } from '@/components/ui/multi-group-salary-bars';
import { positionsApi, reviewsApi, equityAnalysisApi } from '@/services/api';
import type { PositionMappingWithCupa, ReviewCommentWithUser, EquityAnalysisWithPosition } from '@cupa/shared';
import { AUDIT_STATUSES } from '@cupa/shared';
import { formatDateTime } from '@/lib/utils';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [position, setPosition] = useState<PositionMappingWithCupa | null>(null);
  const [comments, setComments] = useState<ReviewCommentWithUser[]>([]);
  const [equityData, setEquityData] = useState<EquityAnalysisWithPosition | null>(null);
  const [raiseHistory, setRaiseHistory] = useState<Array<{
    id: number;
    dataYear: string;
    currentSalary: number | null;
    equityGap: number | null;
    proposedRaise: number | null;
    actualRaiseGiven: number | null;
    snapshotDate: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      try {
        const [positionData, commentsData] = await Promise.all([
          positionsApi.get(parseInt(id)),
          reviewsApi.getComments(parseInt(id)),
        ]);
        setPosition(positionData);
        setComments(commentsData);

        // Try to load equity data for this position
        if (positionData.vpStem) {
          try {
            const equityPositions = await equityAnalysisApi.getPositions({
              vpStem: positionData.vpStem,
              limit: 500,
            });
            const matchingEquity = equityPositions.data.find(
              (p) => p.positionMappingId === positionData.id
            );
            if (matchingEquity) {
              setEquityData(matchingEquity);
            }
          } catch (err) {
            // Equity data may not be available yet
            console.warn('Could not load equity data:', err);
          }
        }

        // Try to load raise history
        if (positionData.employeeId) {
          try {
            const history = await equityAnalysisApi.getEmployeeHistory(positionData.employeeId);
            setRaiseHistory(history);
          } catch (err) {
            console.warn('Could not load raise history:', err);
          }
        }
      } catch (error) {
        console.error('Failed to load position:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!position) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Position not found</p>
        <Button asChild variant="link" className="mt-4">
          <Link to="/positions">Back to Positions</Link>
        </Button>
      </div>
    );
  }

  const statusConfig = AUDIT_STATUSES[position.auditStatus as keyof typeof AUDIT_STATUSES];
  const percentOfMedian =
    equityData?.currentSalary && equityData?.adjustedMedian
      ? ((equityData.currentSalary / equityData.adjustedMedian) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/positions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{position.employeeName}</h1>
          <p className="text-muted-foreground">{position.institutionalTitle}</p>
        </div>
        <Badge
          variant={
            position.auditStatus === 'confirmed'
              ? 'success'
              : position.auditStatus === 'flagged'
                ? 'red'
                : position.auditStatus === 'resolved'
                  ? 'purple'
                  : 'gray'
          }
          className="ml-auto"
        >
          {statusConfig?.label || position.auditStatus}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Employee Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Employee Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Employee ID</p>
              <p className="font-medium">{position.employeeId}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{position.employeeName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Institutional Title</p>
              <p className="font-medium">{position.institutionalTitle}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Supervisor</p>
              <p className="font-medium">{position.supervisor || '-'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Organization */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Division</p>
              <p className="font-medium">{position.division}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Department</p>
              <p className="font-medium">{position.department}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">VP Stem</p>
              <p className="font-medium">{position.vpStem}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">FTE</p>
              <p className="font-medium">
                {position.fte !== undefined ? `${(position.fte * 100).toFixed(0)}%` : '-'}
                {position.appointmentMonths !== undefined &&
                  position.appointmentMonths < 12 &&
                  ` (${position.appointmentMonths}-month)`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CUPA Mapping */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              CUPA Classification
            </CardTitle>
            <CardDescription>
              Standardized position classification from CUPA-HR
            </CardDescription>
          </CardHeader>
          <CardContent>
            {position.cupaCode ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">CUPA Code</p>
                    <p className="font-mono text-lg font-bold">{position.cupaCode}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">CUPA Title</p>
                    <p className="font-medium">{position.cupaTitle}</p>
                  </div>
                </div>
                {position.cupaDescription && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Description</p>
                    <p className="text-sm bg-muted p-3 rounded-md">{position.cupaDescription}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No CUPA code assigned</p>
                <p className="text-sm">
                  This position needs to be mapped to a CUPA classification
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compensation & Equity */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Compensation & Equity
            </CardTitle>
            <CardDescription>
              Current compensation, equity gap analysis, and salary positioning
            </CardDescription>
          </CardHeader>
          <CardContent>
            {equityData ? (
              <div className="space-y-6">
                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Current Salary</p>
                    <p className="text-lg font-bold font-mono">
                      {formatCurrency(equityData.currentSalary)}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Adjusted Median</p>
                    <p className="text-lg font-bold font-mono">
                      {formatCurrency(equityData.adjustedMedian)}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Equity Gap</p>
                    <p
                      className={`text-lg font-bold font-mono ${
                        equityData.equityGap && equityData.equityGap > 0
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {formatCurrency(equityData.equityGap)}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Compa-Ratio</p>
                    <p
                      className={`text-lg font-bold ${
                        percentOfMedian && parseFloat(percentOfMedian) < 95
                          ? 'text-red-600'
                          : parseFloat(percentOfMedian || '100') > 105
                            ? 'text-green-600'
                            : 'text-blue-600'
                      }`}
                    >
                      {percentOfMedian ? `${percentOfMedian}%` : '-'}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Proposed Raise</p>
                    <p className="text-lg font-bold font-mono text-blue-600">
                      {equityData.proposedRaise > 0
                        ? formatCurrency(equityData.proposedRaise)
                        : '-'}
                    </p>
                  </div>
                </div>

                {/* Primary Salary Range Bar */}
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm font-medium mb-3">Primary Benchmark (Equity Gap Basis)</p>
                  <SalaryRangeBar
                    currentSalary={equityData.totalCompensation || equityData.currentSalary}
                    adjustedMedian={equityData.adjustedMedian}
                    baseMedian={equityData.baseMedian}
                    proposedRaise={
                      equityData.proposedRaise > 0 ? equityData.proposedRaise : null
                    }
                    showLabels
                  />
                </div>

                {/* Multi-Group Comparison Bars */}
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm font-medium mb-3">All Peer Group Comparisons</p>
                  <MultiGroupSalaryBars
                    cupaCode={position.cupaCode}
                    currentSalary={equityData.totalCompensation || equityData.currentSalary}
                    fte={equityData.fte || 1}
                    appointmentMonths={equityData.appointmentMonths || 12}
                    proposedRaise={
                      equityData.proposedRaise > 0 ? equityData.proposedRaise : null
                    }
                  />
                </div>

                {/* Additional Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Type: </span>
                    <Badge variant="secondary">{equityData.compensationType}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">FTE: </span>
                    <span className="font-medium">
                      {(equityData.fte * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Months: </span>
                    <span className="font-medium">{equityData.appointmentMonths}</span>
                  </div>
                  {equityData.hasHousingBenefit && (
                    <div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Housing Benefit
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ) : position.currentSalary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Current Salary</p>
                    <p className="text-lg font-bold font-mono">
                      {formatCurrency(position.currentSalary)}
                    </p>
                  </div>
                  {position.compensationType && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="text-lg font-medium">{position.compensationType}</p>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground italic">
                  Run equity analysis to see gap and salary positioning data.
                </p>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No compensation data available</p>
                <p className="text-sm">Import compensation data to see salary information</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Raise History */}
        {raiseHistory.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Raise History
              </CardTitle>
              <CardDescription>Historical equity adjustments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Year</th>
                      <th className="text-right py-2 px-3 font-medium">Salary</th>
                      <th className="text-right py-2 px-3 font-medium">Gap</th>
                      <th className="text-right py-2 px-3 font-medium">Proposed</th>
                      <th className="text-right py-2 px-3 font-medium">Actual Raise</th>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raiseHistory.map((record) => (
                      <tr key={record.id} className="border-b">
                        <td className="py-2 px-3 font-medium">{record.dataYear}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatCurrency(record.currentSalary)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          <span
                            className={
                              record.equityGap && record.equityGap > 0
                                ? 'text-red-600'
                                : 'text-green-600'
                            }
                          >
                            {formatCurrency(record.equityGap)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatCurrency(record.proposedRaise)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {record.actualRaiseGiven ? (
                            <span className="text-green-600">
                              {formatCurrency(record.actualRaiseGiven)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {new Date(record.snapshotDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Comments */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Review History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {comments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No review comments yet</p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{comment.userName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {comment.userRole}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                    {comment.flagReason && (
                      <Badge variant="red" className="mb-2">
                        Flagged: {comment.flagReason.replace('_', ' ')}
                      </Badge>
                    )}
                    <p className="text-sm">{comment.comment}</p>
                    {comment.suggestedCupaCode && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Suggested CUPA Code:{' '}
                        <span className="font-mono">{comment.suggestedCupaCode}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
