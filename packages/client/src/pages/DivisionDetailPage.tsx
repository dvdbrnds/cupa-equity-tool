import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  Download,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SalaryRangeBarCompact } from '@/components/ui/salary-range-bar';
import { EquitySummaryCards } from '@/components/dashboard/EquitySummaryCards';
import { PositionCard } from '@/components/review/PositionCard';
import { AdjustmentPanel } from '@/components/AdjustmentPanel';
import { useAuth } from '@/context/AuthContext';
import { equityAnalysisApi, reviewCyclesApi } from '@/services/api';
import type { EquityAnalysisWithPosition, EquitySummaryByVp } from '@cupa/shared';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function DivisionDetailPage() {
  const { vp } = useParams<{ vp: string }>();
  const vpStem = decodeURIComponent(vp || '');
  const navigate = useNavigate();
  const { user } = useAuth();

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  const [vpData, setVpData] = useState<EquitySummaryByVp | null>(null);
  const [positions, setPositions] = useState<EquityAnalysisWithPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [totalPositionCount, setTotalPositionCount] = useState(0);
  const [page, setPage] = useState(1);
  const [compensationType, setCompensationType] = useState<string>('all');
  const [gapOnly, setGapOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const limit = 50;

  // Raise editing
  const [editingRaise, setEditingRaise] = useState<Record<number, string>>({});
  const [savingRaise, setSavingRaise] = useState<number | null>(null);
  const raiseDebounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // VP allocations from active review cycles (for HR view)
  const [vpAllocatedBudget, setVpAllocatedBudget] = useState<number | null>(null);
  const [vpSupplementalOffer, setVpSupplementalOffer] = useState<number | null>(null);
  const [vpReviewStatus, setVpReviewStatus] = useState<string | null>(null);
  const [activeCycleId, setActiveCycleId] = useState<number | null>(null);

  useEffect(() => {
    if (vpStem) {
      loadVpData();
      loadPositions();
      if (isInstitutionWide) {
        loadVpAllocations();
      }
    }
    return () => {
      Object.values(raiseDebounceRef.current).forEach(clearTimeout);
    };
  }, [vpStem]);

  useEffect(() => {
    if (vpStem) {
      loadPositions();
    }
  }, [compensationType, gapOnly, page]);

  async function loadVpData() {
    try {
      const allVps = await equityAnalysisApi.getByVp();
      const found = allVps.find((v) => v.vpStem === vpStem);
      setVpData(found || null);
    } catch (err) {
      console.error('Failed to load VP data:', err);
    }
  }

  async function loadVpAllocations() {
    try {
      const cycles = await reviewCyclesApi.list();
      const activeCycle = cycles.find(
        (c) =>
          c.status === 'vp_review_in_progress' ||
          c.status === 'hr_final_review' ||
          c.status === 'pending_vp_review' ||
          c.status === 'pending_pc_approval' ||
          c.status === 'pc_approved'
      );
      if (activeCycle) {
        setActiveCycleId(activeCycle.id);
        const { vpStatuses } = await reviewCyclesApi.get(activeCycle.id);
        const vpStatus = vpStatuses.find((v) => v.vpStem === vpStem);
        if (vpStatus) {
          setVpAllocatedBudget(vpStatus.allocatedBudget);
          setVpSupplementalOffer(vpStatus.vpSupplementalOffer);
          setVpReviewStatus(vpStatus.status);
        }
      }
    } catch (err) {
      console.error('Failed to load VP allocations:', err);
    }
  }

  async function loadPositions() {
    if (!vpStem) return;
    setPositionsLoading(true);
    try {
      const data = await equityAnalysisApi.getPositions({
        vpStem,
        compensationType: compensationType !== 'all' ? compensationType : undefined,
        gapOnly,
        page,
        limit,
      });
      setPositions(data.data);
      setTotalPositionCount(data.total);
      const raises: Record<number, string> = {};
      data.data.forEach((p) => {
        if (p.proposedRaise && p.proposedRaise > 0) {
          raises[p.positionMappingId] = String(p.proposedRaise);
        }
      });
      setEditingRaise(raises);
    } catch (err) {
      console.error('Failed to load positions:', err);
    } finally {
      setPositionsLoading(false);
    }
  }

  function getEffectiveRaise(
    positionMappingId: number,
    serverProposedRaise: number | null | undefined
  ): number {
    const editValue = editingRaise[positionMappingId];
    if (editValue !== undefined && editValue !== '') {
      return parseFloat(editValue.replace(/[,$]/g, '')) || 0;
    }
    return serverProposedRaise || 0;
  }

  async function handleRaiseChange(positionMappingId: number, value: string) {
    setEditingRaise((prev) => ({ ...prev, [positionMappingId]: value }));
    if (raiseDebounceRef.current[positionMappingId]) {
      clearTimeout(raiseDebounceRef.current[positionMappingId]);
    }
    raiseDebounceRef.current[positionMappingId] = setTimeout(async () => {
      const amount = parseFloat(value?.replace(/[,$]/g, '') || '0');
      setSavingRaise(positionMappingId);
      try {
        await equityAnalysisApi.proposeRaise(positionMappingId, amount);
        setPositions((prev) =>
          prev.map((p) =>
            p.positionMappingId === positionMappingId ? { ...p, proposedRaise: amount } : p
          )
        );
      } catch (err) {
        console.error('Failed to save raise:', err);
      } finally {
        setSavingRaise(null);
        delete raiseDebounceRef.current[positionMappingId];
      }
    }, 500);
  }

  async function handleRaiseBlur(positionMappingId: number) {
    if (raiseDebounceRef.current[positionMappingId]) {
      clearTimeout(raiseDebounceRef.current[positionMappingId]);
      delete raiseDebounceRef.current[positionMappingId];
    }
    const value = editingRaise[positionMappingId];
    const amount = parseFloat(value?.replace(/[,$]/g, '') || '0');
    setSavingRaise(positionMappingId);
    try {
      await equityAnalysisApi.proposeRaise(positionMappingId, amount);
      setPositions((prev) =>
        prev.map((p) =>
          p.positionMappingId === positionMappingId ? { ...p, proposedRaise: amount } : p
        )
      );
    } catch (err) {
      console.error('Failed to save raise:', err);
    } finally {
      setSavingRaise(null);
    }
  }

  const totalProposed = positions.reduce(
    (sum, p) => sum + getEffectiveRaise(p.positionMappingId, p.proposedRaise),
    0
  );
  const totalPages = Math.ceil(totalPositionCount / limit);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main Content */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isInstitutionWide && (
              <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                All Divisions
              </Button>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {vpData?.vpTitle || vpStem}
              </h1>
              <p className="text-muted-foreground">
                {isInstitutionWide
                  ? 'Position equity details'
                  : 'Equity analysis for your division'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="border rounded-md p-0.5 flex">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="px-2"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="px-2"
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => equityAnalysisApi.export()}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {vpData && (
          <EquitySummaryCards
            totalGap={vpData.totalGap}
            averageGap={vpData.averageGap}
            positionsWithGap={vpData.underpaidCount}
            analyzedPositions={vpData.analyzedCount}
            totalProposedRaises={totalProposed}
          />
        )}

        {/* Filters */}
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filters:</span>
          </div>
          <Select
            value={compensationType}
            onValueChange={(v) => {
              setCompensationType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="salaried">Salaried</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={gapOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setGapOnly(!gapOnly);
              setPage(1);
            }}
          >
            Underpaid Only
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {totalPositionCount} position{totalPositionCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Position List */}
        {positionsLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : positions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No positions found
            </CardContent>
          </Card>
        ) : viewMode === 'cards' ? (
          <div className="space-y-3">
            {positions.map((pos) => {
              const effectiveRaise = getEffectiveRaise(
                pos.positionMappingId,
                pos.proposedRaise
              );
              return (
                <PositionCard
                  key={pos.id}
                  pos={pos}
                  effectiveRaise={effectiveRaise}
                  editingRaise={editingRaise[pos.positionMappingId] || ''}
                  savingRaise={savingRaise === pos.positionMappingId}
                  onRaiseChange={(v) => handleRaiseChange(pos.positionMappingId, v)}
                  onRaiseBlur={() => handleRaiseBlur(pos.positionMappingId)}
                />
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Employee</th>
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">CUPA</th>
                      <th className="text-center p-3 font-medium">Range</th>
                      <th className="text-right p-3 font-medium">Current</th>
                      <th className="text-right p-3 font-medium">Target</th>
                      <th className="text-right p-3 font-medium">Gap</th>
                      <th className="text-right p-3 font-medium">Raise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const tableEffectiveRaise = getEffectiveRaise(
                        pos.positionMappingId,
                        pos.proposedRaise
                      );
                      return (
                        <tr key={pos.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">
                            <div className="font-medium">{pos.employeeName}</div>
                            <div className="text-xs text-muted-foreground">
                              {pos.employeeId}
                            </div>
                          </td>
                          <td className="p-3">
                            <div>{pos.institutionalTitle}</div>
                            <div className="text-xs text-muted-foreground">
                              {pos.department}
                            </div>
                          </td>
                          <td className="p-3">
                            {pos.cupaCode ? (
                              <div className="font-mono text-xs">{pos.cupaCode}</div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <SalaryRangeBarCompact
                              currentSalary={pos.totalCompensation || pos.currentSalary}
                              adjustedMedian={pos.adjustedMedian}
                              proposedRaise={tableEffectiveRaise || null}
                            />
                          </td>
                          <td className="p-3 text-right font-mono">
                            {formatCurrency(pos.currentSalary)}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {formatCurrency(pos.adjustedMedian)}
                          </td>
                          <td className="p-3 text-right font-mono">
                            <span
                              className={
                                pos.equityGap && pos.equityGap > 0
                                  ? 'text-red-600 font-semibold'
                                  : 'text-green-600'
                              }
                            >
                              {formatCurrency(pos.equityGap)}
                            </span>
                          </td>
                          <td className="p-3">
                            <Input
                              type="text"
                              placeholder="$0"
                              value={editingRaise[pos.positionMappingId] || ''}
                              onChange={(e) =>
                                handleRaiseChange(pos.positionMappingId, e.target.value)
                              }
                              onBlur={() => handleRaiseBlur(pos.positionMappingId)}
                              className={`h-7 w-24 text-xs font-mono ${savingRaise === pos.positionMappingId ? 'opacity-50' : ''}`}
                              disabled={savingRaise === pos.positionMappingId}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1} to{' '}
              {Math.min(page * limit, totalPositionCount)} of {totalPositionCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel */}
      {vpData && (
        <div className="hidden lg:block">
          <AdjustmentPanel
            totalGap={vpData.totalGap}
            vpFilter={vpStem}
            onBudgetAllocated={() => {
              loadPositions();
              loadVpData();
            }}
            vpAllocatedBudget={vpAllocatedBudget}
            vpSupplementalOffer={vpSupplementalOffer}
            vpReviewStatus={vpReviewStatus}
            activeCycleId={activeCycleId}
            onVpReviewApproved={loadVpAllocations}
          />
        </div>
      )}
    </div>
  );
}
