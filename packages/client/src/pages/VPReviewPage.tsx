import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  MessageSquare,
  Loader2,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  ClipboardCheck,
  Download,
  Equal,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SalaryRangeBarCompact } from '@/components/ui/salary-range-bar';
import { PositionCard } from '@/components/review/PositionCard';
import { BudgetSidebar } from '@/components/review/BudgetSidebar';
import { VPFeedbackButtons } from '@/components/review/VPFeedbackButtons';
import { useAuth } from '@/context/AuthContext';
import { equityAnalysisApi, reviewCyclesApi } from '@/services/api';
import type { EquityAnalysisWithPosition, EmployeeFeedbackType } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

interface ActiveReview {
  cycleId: number;
  cycleName: string;
  vpStem: string;
  allocatedBudget: number | null;
  deadline: string | null;
  status: string;
  vpSupplementalOffer: number | null;
  supplementalOfferNotes: string | null;
  supplementalOfferedAt: string | null;
}

interface EmployeeFeedback {
  feedbackType: EmployeeFeedbackType;
  adjustedRaise: number | null;
  notes: string | null;
}

export function VPReviewPage() {
  const { user } = useAuth();

  // Review state
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [positions, setPositions] = useState<EquityAnalysisWithPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [totalPositionCount, setTotalPositionCount] = useState(0);
  const [page, setPage] = useState(1);
  const [compensationType, setCompensationType] = useState<string>('all');
  const [gapOnly, setGapOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isLoading, setIsLoading] = useState(true);
  const limit = 50;

  // Raise editing
  const [editingRaise, setEditingRaise] = useState<Record<number, string>>({});
  const [savingRaise, setSavingRaise] = useState<number | null>(null);
  const raiseDebounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Feedback
  const [employeeFeedback, setEmployeeFeedback] = useState<Record<number, EmployeeFeedback>>({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState<number | null>(null);
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [adjustedRaiseInput, setAdjustedRaiseInput] = useState('');

  // Supplemental funding
  const [vpSupplementalFunding, setVpSupplementalFunding] = useState<string>('');
  const [supplementalOfferNotes, setSupplementalOfferNotes] = useState('');

  // Auto-allocate
  const [isAutoAllocating, setIsAutoAllocating] = useState(false);
  const [isClearingRaises, setIsClearingRaises] = useState(false);
  const [lastAllocation, setLastAllocation] = useState<{
    budget: number;
    allocated: number;
    positions: number;
  } | null>(null);

  // Submit
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRequestChangesDialog, setShowRequestChangesDialog] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPendingReviews();
    return () => {
      Object.values(raiseDebounceRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (activeReview) {
      loadPositions(activeReview.vpStem);
    }
  }, [activeReview, compensationType, gapOnly, page]);

  async function loadPendingReviews() {
    setIsLoading(true);
    try {
      const reviews = await reviewCyclesApi.getMyPendingReviews();
      const actionable = reviews.filter(
        (r) => r.status === 'pending' || r.status === 'in_review' || r.status === 'hr_revised'
      );
      if (actionable.length > 0 && actionable[0]) {
        const review = actionable[0];
        setActiveReview({
          cycleId: review.cycleId,
          cycleName: review.cycleName,
          vpStem: review.vpStem,
          allocatedBudget: review.allocatedBudget,
          deadline: review.deadline,
          status: review.status,
          vpSupplementalOffer: review.vpSupplementalOffer,
          supplementalOfferNotes: review.supplementalOfferNotes,
          supplementalOfferedAt: review.supplementalOfferedAt,
        });
        if (review.vpSupplementalOffer && review.vpSupplementalOffer > 0) {
          setVpSupplementalFunding(review.vpSupplementalOffer.toString());
          setSupplementalOfferNotes(review.supplementalOfferNotes || '');
        }
        loadEmployeeFeedback(review.cycleId);
      } else {
        setActiveReview(null);
      }
    } catch (err) {
      console.error('Failed to load pending reviews:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadEmployeeFeedback(cycleId: number) {
    setFeedbackLoading(true);
    try {
      const feedback = await reviewCyclesApi.getEmployeeFeedback(cycleId);
      const map: Record<number, EmployeeFeedback> = {};
      feedback.forEach(
        (f: {
          positionMappingId: number;
          feedbackType: EmployeeFeedbackType;
          adjustedRaise: number | null;
          notes: string | null;
        }) => {
          map[f.positionMappingId] = {
            feedbackType: f.feedbackType,
            adjustedRaise: f.adjustedRaise,
            notes: f.notes,
          };
        }
      );
      setEmployeeFeedback(map);
    } catch (err) {
      console.error('Failed to load feedback:', err);
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function loadPositions(vpStem: string) {
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

  async function handleQuickFeedback(
    positionMappingId: number,
    feedbackType: EmployeeFeedbackType
  ) {
    if (!activeReview) return;
    setSavingFeedback(positionMappingId);
    try {
      await reviewCyclesApi.saveEmployeeFeedback(
        activeReview.cycleId,
        positionMappingId,
        feedbackType
      );
      setEmployeeFeedback((prev) => ({
        ...prev,
        [positionMappingId]: { feedbackType, adjustedRaise: null, notes: null },
      }));
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSavingFeedback(null);
    }
  }

  async function handleSaveFeedback(
    positionMappingId: number,
    feedbackType: EmployeeFeedbackType
  ) {
    if (!activeReview) return;
    setSavingFeedback(positionMappingId);
    try {
      await reviewCyclesApi.saveEmployeeFeedback(
        activeReview.cycleId,
        positionMappingId,
        feedbackType,
        adjustedRaiseInput ? parseFloat(adjustedRaiseInput) : undefined,
        feedbackNotes || undefined
      );
      setEmployeeFeedback((prev) => ({
        ...prev,
        [positionMappingId]: {
          feedbackType,
          adjustedRaise: adjustedRaiseInput ? parseFloat(adjustedRaiseInput) : null,
          notes: feedbackNotes || null,
        },
      }));
      setExpandedFeedback(null);
      setFeedbackNotes('');
      setAdjustedRaiseInput('');
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSavingFeedback(null);
    }
  }

  async function handleAutoAllocate() {
    if (!activeReview) return;
    const hrAllocated = activeReview.allocatedBudget || 0;
    const supplemental = parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
    const totalBudget = hrAllocated + supplemental;
    if (totalBudget <= 0) return;
    setIsAutoAllocating(true);
    try {
      const result = await reviewCyclesApi.vpAutoAllocate(activeReview.cycleId, totalBudget);
      setLastAllocation({
        budget: totalBudget,
        allocated: result.allocated,
        positions: result.positionsUpdated,
      });
      await loadPositions(activeReview.vpStem);
    } catch (err) {
      console.error('Failed to auto-allocate:', err);
    } finally {
      setIsAutoAllocating(false);
    }
  }

  async function handleClearRaises() {
    if (!activeReview) return;
    setIsClearingRaises(true);
    try {
      await reviewCyclesApi.vpClearRaises(activeReview.cycleId);
      setLastAllocation(null);
      await loadPositions(activeReview.vpStem);
    } catch (err) {
      console.error('Failed to clear raises:', err);
    } finally {
      setIsClearingRaises(false);
    }
  }

  async function handleApproveReview() {
    if (!activeReview) return;
    
    const supplementalAmount =
      parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
    
    // Require notes if supplemental funding is offered
    if (supplementalAmount > 0 && !supplementalOfferNotes.trim()) {
      setError('Please provide a note explaining where the additional funding is coming from before approving.');
      setShowApproveDialog(false);
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (supplementalAmount > 0) {
        await reviewCyclesApi.vpSubmitSupplementalOffer(
          activeReview.cycleId,
          supplementalAmount,
          supplementalOfferNotes
        );
      }
      await reviewCyclesApi.vpApprove(activeReview.cycleId, submitNotes || undefined);
      setShowApproveDialog(false);
      setActiveReview(null);
      setSubmitNotes('');
      loadPendingReviews();
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestChanges() {
    if (!activeReview || !submitNotes.trim()) return;
    setIsSubmitting(true);
    try {
      await reviewCyclesApi.vpRequestChanges(activeReview.cycleId, submitNotes);
      setShowRequestChangesDialog(false);
      setActiveReview(null);
      setSubmitNotes('');
      loadPendingReviews();
    } catch (err) {
      console.error('Failed to request changes:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalProposed = positions.reduce(
    (sum, p) => sum + getEffectiveRaise(p.positionMappingId, p.proposedRaise),
    0
  );
  const totalPages = Math.ceil(totalPositionCount / limit);

  // Auto-populate supplemental funding when proposed raises exceed HR budget
  useEffect(() => {
    if (!activeReview) return;
    const hrBudget = activeReview.allocatedBudget || 0;
    const overage = Math.max(0, totalProposed - hrBudget);
    const currentSupplemental = parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
    
    if (overage > 0 && overage > currentSupplemental) {
      // Round to 2 decimal places
      setVpSupplementalFunding(String(Math.round(overage * 100) / 100));
    } else if (overage === 0 && currentSupplemental > 0 && totalProposed > 0) {
      // Clear supplemental if no longer over budget (only if there are raises)
      setVpSupplementalFunding('');
      setSupplementalOfferNotes('');
    }
  }, [totalProposed, activeReview]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // No active review
  if (!activeReview) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No Pending Reviews</p>
            <p className="text-muted-foreground mt-2">
              You don't have any equity reviews awaiting your action right now. You'll be
              notified when HR initiates the next review cycle.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main Content */}
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{activeReview.cycleName}</h1>
            <p className="text-muted-foreground">
              Review equity adjustments for your division
            </p>
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

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
            <span className="text-red-600 dark:text-red-400 text-sm flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm font-bold">×</button>
          </div>
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

        {/* Positions */}
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
                  feedbackSlot={
                    <VPFeedbackButtons
                      currentFeedback={employeeFeedback[pos.positionMappingId]?.feedbackType}
                      isSaving={savingFeedback === pos.positionMappingId}
                      isExpanded={expandedFeedback === pos.positionMappingId}
                      onQuickFeedback={(type) =>
                        handleQuickFeedback(pos.positionMappingId, type)
                      }
                      onToggleExpand={() => {
                        if (expandedFeedback === pos.positionMappingId) {
                          setExpandedFeedback(null);
                        } else {
                          setExpandedFeedback(pos.positionMappingId);
                          setFeedbackNotes(
                            employeeFeedback[pos.positionMappingId]?.notes || ''
                          );
                          setAdjustedRaiseInput(
                            employeeFeedback[pos.positionMappingId]?.adjustedRaise?.toString() ||
                              ''
                          );
                        }
                      }}
                      onSaveFeedback={(type) =>
                        handleSaveFeedback(pos.positionMappingId, type)
                      }
                      expandedForm={{
                        notes: feedbackNotes,
                        onNotesChange: setFeedbackNotes,
                        adjustedRaise: adjustedRaiseInput,
                        onAdjustedRaiseChange: setAdjustedRaiseInput,
                        proposedRaise: pos.proposedRaise,
                      }}
                    />
                  }
                />
              );
            })}
          </div>
        ) : (
          /* Table View */
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
                            <div className="flex gap-1">
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
                              {pos.equityGap !== null && pos.equityGap > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-1.5 flex-shrink-0 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/30"
                                  title={`True up to median: ${formatCurrency(pos.equityGap)}`}
                                  onClick={() =>
                                    handleRaiseChange(
                                      pos.positionMappingId,
                                      String(Math.round((pos.equityGap ?? 0) * 100) / 100)
                                    )
                                  }
                                  disabled={savingRaise === pos.positionMappingId}
                                >
                                  <Equal className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
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

        {/* Bottom Action Bar */}
        <div className="sticky bottom-0 bg-background border-t p-4 -mx-6 -mb-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {Object.keys(employeeFeedback).length} of {positions.length} employees reviewed
          </div>
          <div className="flex items-center gap-2">
            <Dialog
              open={showRequestChangesDialog}
              onOpenChange={setShowRequestChangesDialog}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Request Discussion
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Discussion with HR</DialogTitle>
                  <DialogDescription>
                    Describe what you'd like to discuss before approving.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="request-notes">Notes (required)</Label>
                  <Textarea
                    id="request-notes"
                    placeholder="What would you like to discuss?"
                    value={submitNotes}
                    onChange={(e) => setSubmitNotes(e.target.value)}
                    rows={4}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowRequestChangesDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRequestChanges}
                    disabled={!submitNotes.trim() || isSubmitting}
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Request
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve Review
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Approve Equity Review</DialogTitle>
                  <DialogDescription>
                    You're approving the equity adjustments for {positions.length} employees.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  {(() => {
                    const suppAmount = parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
                    const needsFundingNote = suppAmount > 0 && !supplementalOfferNotes.trim();
                    return (
                      <>
                        {suppAmount > 0 && (
                          <div className={`p-3 rounded-lg text-sm ${needsFundingNote ? 'bg-red-50 dark:bg-red-950/30 border border-red-200' : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200'}`}>
                            <p className="font-medium">
                              Additional funding: {formatCurrency(suppAmount)}
                            </p>
                            {needsFundingNote ? (
                              <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                                You must explain where this funding is coming from in the sidebar before approving.
                              </p>
                            ) : (
                              <p className="text-muted-foreground text-xs mt-1">
                                Source: {supplementalOfferNotes}
                              </p>
                            )}
                          </div>
                        )}
                        <div>
                          <Label htmlFor="approve-notes">Notes (optional)</Label>
                          <Textarea
                            id="approve-notes"
                            placeholder="Any notes for HR..."
                            value={submitNotes}
                            onChange={(e) => setSubmitNotes(e.target.value)}
                            rows={3}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleApproveReview}
                    disabled={isSubmitting || (parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) > 0 && !supplementalOfferNotes.trim())}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Approval
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Right Panel - Budget Sidebar */}
      <div className="hidden lg:block">
        <BudgetSidebar
          cycleName={activeReview.cycleName}
          allocatedBudget={activeReview.allocatedBudget || 0}
          totalProposed={totalProposed}
          positionCount={positions.length}
          reviewedCount={Object.keys(employeeFeedback).length}
          deadline={activeReview.deadline}
          vpSupplementalFunding={vpSupplementalFunding}
          onVpSupplementalFundingChange={setVpSupplementalFunding}
          supplementalOfferNotes={supplementalOfferNotes}
          onSupplementalOfferNotesChange={setSupplementalOfferNotes}
          existingSupplementalOffer={activeReview.vpSupplementalOffer}
          onAutoAllocate={handleAutoAllocate}
          onClearRaises={handleClearRaises}
          isAutoAllocating={isAutoAllocating}
          isClearingRaises={isClearingRaises}
          lastAllocation={lastAllocation}
        />
      </div>
    </div>
  );
}
