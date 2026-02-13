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
      console.log('[DEBUG] summaryData:', JSON.stringify(summaryData));
      console.log('[DEBUG] vpData length:', vpData?.length);
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

        {/* DEBUG: temporary diagnostic — remove after fixing */}
        <div className="p-3 bg-yellow-50 border border-yellow-300 rounded text-xs font-mono">
          <strong>DEBUG:</strong>{' '}
          summary={summary ? `analyzedPositions=${summary.analyzedPositions}, totalGap=${summary.totalGap}` : 'null'}{' | '}
          hasAnalysis={String(!!summary && summary.analyzedPositions > 0)}{' | '}
          vpSummary.length={vpSummary.length}{' | '}
          error={error || 'none'}
        </div>

        {/* Data Pipeline -- always visible */}
        <SetupChecklist />

        {/* Active Review Cycle Banner */}
        {activeCycle && <CycleStatusBanner cycle={activeCycle} />}

        {/* Equity Summary -- only shown after analysis */}
        {hasAnalysis && (
          <>
            <EquitySummaryCards
              totalGap={summary?.totalGap || 0}
              averageGap={summary?.averageGap || 0}
              positionsWithGap={summary?.positionsWithGap || 0}
              analyzedPositions={summary?.analyzedPositions || 0}
            />

            <VPDivisionList
              vpSummary={vpSummary}
              summary={summary}
              vpAllocations={vpAllocations}
            />
          </>
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
