import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/context/AuthContext';
import { equityAnalysisApi, reviewCyclesApi } from '@/services/api';
import { EquitySummaryCards } from '@/components/dashboard/EquitySummaryCards';
import { VPDivisionList } from '@/components/dashboard/VPDivisionList';
import { CycleStatusBanner } from '@/components/dashboard/CycleStatusBanner';
import { SetupChecklist } from '@/components/dashboard/SetupChecklist';
import { AdjustmentPanel } from '@/components/AdjustmentPanel';
import type {
  EquityAnalysisSummary,
  EquitySummaryByVp,
  EquityReviewCycleWithStats,
} from '@cupa/shared';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<EquityAnalysisSummary | null>(null);
  const [vpSummary, setVpSummary] = useState<EquitySummaryByVp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active cycle and VP allocations
  const [activeCycle, setActiveCycle] = useState<EquityReviewCycleWithStats | null>(null);
  const [vpAllocations, setVpAllocations] = useState<
    Record<string, { allocated: number; supplemental: number | null; status: string | null }>
  >({});
  const [activeCycleId, setActiveCycleId] = useState<number | null>(null);

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  // Redirect VP users to their review page
  useEffect(() => {
    if (!isInstitutionWide && user) {
      navigate('/review', { replace: true });
    }
  }, [isInstitutionWide, user, navigate]);

  const loadActiveCycle = useCallback(async () => {
    try {
      const cycles = await reviewCyclesApi.list();
      const active = cycles.find(
        (c) =>
          c.status === 'vp_review_in_progress' ||
          c.status === 'hr_final_review' ||
          c.status === 'pending_vp_review' ||
          c.status === 'pending_pc_approval' ||
          c.status === 'pc_approved' ||
          c.status === 'draft'
      );

      if (active) {
        setActiveCycle(active);
        setActiveCycleId(active.id);
        const { vpStatuses } = await reviewCyclesApi.get(active.id);
        const allocations: Record<
          string,
          { allocated: number; supplemental: number | null; status: string | null }
        > = {};
        vpStatuses.forEach((vp) => {
          allocations[vp.vpStem] = {
            allocated: vp.allocatedBudget || 0,
            supplemental: vp.vpSupplementalOffer || null,
            status: vp.status || null,
          };
        });
        setVpAllocations(allocations);
      } else {
        setActiveCycle(null);
        setActiveCycleId(null);
        setVpAllocations({});
      }
    } catch (err) {
      console.error('Failed to load active cycle:', err);
    }
  }, []);

  const loadSummaryData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryData, vpData] = await Promise.all([
        equityAnalysisApi.getSummary(),
        equityAnalysisApi.getByVp(),
      ]);
      // Log diagnostics for debugging production issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diag = (summaryData as any)?.diagnostics;
      if (diag) {
        console.log('[Equity] Diagnostics:', JSON.stringify(diag));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errors = (summaryData as any)?.errorSample;
        if (errors?.length) console.log('[Equity] Error reasons:', JSON.stringify(errors));
      }
      setSummary(summaryData);
      setVpSummary(vpData);
    } catch (err) {
      console.error('Failed to load equity data:', err);
      setError('Failed to load equity analysis data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummaryData();
    loadActiveCycle();
  }, [loadSummaryData, loadActiveCycle]);

  if (!isInstitutionWide) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const hasAnalysis = summary && summary.analyzedPositions > 0;
  // Also check if analysis was run but all positions errored (equity_gap all NULL)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagnostics = (summary as any)?.diagnostics;
  const analysisRanButEmpty = !hasAnalysis && diagnostics?.totalEaRows > 0;
  // Show VP list if we have data OR if analysis ran (even with errors)
  const showVpSection = hasAnalysis || vpSummary.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main Content */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Equity Dashboard</h1>
            <p className="text-muted-foreground">
              Institution-wide compensation equity analysis
            </p>
          </div>
          <Button variant="outline" onClick={() => { loadSummaryData(); loadActiveCycle(); }} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Analysis ran but no valid results — show diagnostic info */}
        {analysisRanButEmpty && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Equity analysis ran but found no valid results</AlertTitle>
            <AlertDescription>
              {diagnostics.totalEaRows} positions were processed but {diagnostics.withoutGap} had errors.
              {diagnostics.noCupaCode > 0 && ` ${diagnostics.noCupaCode} positions have no CUPA code.`}
              {diagnostics.noSalary > 0 && ` ${diagnostics.noSalary} positions have no salary data.`}
              {diagnostics.cupaSalaryCount === 0 && ' No CUPA salary data has been imported — upload CUPA salary data and re-run the analysis.'}
              {' '}Try re-running the equity analysis from the Data Pipeline above.
            </AlertDescription>
          </Alert>
        )}

        {/* Data Pipeline -- always visible */}
        <SetupChecklist />

        {/* Active Review Cycle Banner */}
        {activeCycle && <CycleStatusBanner cycle={activeCycle} />}

        {/* Equity Summary -- shown after analysis with valid results */}
        {hasAnalysis && (
          <EquitySummaryCards
            totalGap={summary?.totalGap || 0}
            averageGap={summary?.averageGap || 0}
            positionsWithGap={summary?.positionsWithGap || 0}
            analyzedPositions={summary?.analyzedPositions || 0}
          />
        )}

        {/* VP Division List -- shown if analysis has data OR VP summary is available */}
        {showVpSection && (
          <VPDivisionList
            vpSummary={vpSummary}
            summary={summary}
            vpAllocations={vpAllocations}
          />
        )}
      </div>

      {/* Right Panel - Adjustment */}
      {hasAnalysis && (
        <div className="hidden lg:block">
          <AdjustmentPanel
            totalGap={summary?.totalGap || 0}
            onBudgetAllocated={() => {
              loadSummaryData();
              loadActiveCycle();
            }}
            activeCycleId={activeCycleId}
            onVpReviewApproved={loadActiveCycle}
          />
        </div>
      )}

      {/* Mobile panel */}
      {hasAnalysis && (
        <div className="lg:hidden">
          <AdjustmentPanel
            totalGap={summary?.totalGap || 0}
            onBudgetAllocated={() => {
              loadSummaryData();
              loadActiveCycle();
            }}
            activeCycleId={activeCycleId}
            onVpReviewApproved={loadActiveCycle}
          />
        </div>
      )}
    </div>
  );
}
