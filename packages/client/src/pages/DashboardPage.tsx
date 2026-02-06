import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Users, AlertCircle, Download, RefreshCw, ArrowLeft, Filter, LayoutGrid, Table as TableIcon, ChevronRight, ClipboardCheck, CheckCircle2, MessageSquare, ThumbsUp, ArrowUpRight, ArrowDownRight, Clock, Loader2, Wand2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SalaryRangeBar, SalaryRangeBarCompact } from '@/components/ui/salary-range-bar';
import { useAuth } from '@/context/AuthContext';
import { equityAnalysisApi, reviewCyclesApi } from '@/services/api';
import { AdjustmentPanel } from '@/components/AdjustmentPanel';
import type { EquityAnalysisSummary, EquitySummaryByVp, EquityAnalysisWithPosition, EmployeeFeedbackType } from '@cupa/shared';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';

// Feedback options for VP review
const feedbackOptions: { type: EmployeeFeedbackType; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { type: 'approve', label: 'OK', icon: ThumbsUp, color: 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100' },
  { type: 'increase', label: '+', icon: ArrowUpRight, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100' },
  { type: 'decrease', label: '-', icon: ArrowDownRight, color: 'text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100' },
  { type: 'defer', label: 'Later', icon: Clock, color: 'text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100' },
  { type: 'discuss', label: '?', icon: MessageSquare, color: 'text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100' },
];

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

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Summary state
  const [summary, setSummary] = useState<EquityAnalysisSummary | null>(null);
  const [vpSummary, setVpSummary] = useState<EquitySummaryByVp[]>([]);
  const [salaryYears, setSalaryYears] = useState<Array<{ data_year: string; count: number }>>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showCalculateDialog, setShowCalculateDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VP Detail state
  const [selectedVp, setSelectedVp] = useState<EquitySummaryByVp | null>(null);
  const [positions, setPositions] = useState<EquityAnalysisWithPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [totalPositionCount, setTotalPositionCount] = useState(0);
  const [page, setPage] = useState(1);
  const [compensationType, setCompensationType] = useState<string>('all');
  const [gapOnly, setGapOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [editingRaise, setEditingRaise] = useState<{ [key: number]: string }>({});
  const [savingRaise, setSavingRaise] = useState<number | null>(null);
  const limit = 50;
  const raiseDebounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Review mode state
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [employeeFeedback, setEmployeeFeedback] = useState<Record<number, EmployeeFeedback>>({});
  const [vpSupplementalFunding, setVpSupplementalFunding] = useState<string>('');
  const [supplementalOfferNotes, setSupplementalOfferNotes] = useState('');
  const [isAutoAllocating, setIsAutoAllocating] = useState(false);
  const [isClearingRaises, setIsClearingRaises] = useState(false);
  const [lastAllocation, setLastAllocation] = useState<{ budget: number; allocated: number; positions: number } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  
  // VP allocations from active review cycles (for HR view)
  const [vpAllocations, setVpAllocations] = useState<Record<string, { allocated: number; supplemental: number | null; status: string | null }>>({}); 
  const [activeCycleId, setActiveCycleId] = useState<number | null>(null);
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [adjustedRaiseInput, setAdjustedRaiseInput] = useState('');
  const [savingFeedback, setSavingFeedback] = useState<number | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRequestChangesDialog, setShowRequestChangesDialog] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  useEffect(() => {
    loadSummaryData();
    loadPendingReviews();
    if (isInstitutionWide) {
      loadVpAllocations();
    }
  }, []);

  async function loadVpAllocations() {
    // For HR users, load VP allocations from active review cycles
    try {
      const cycles = await reviewCyclesApi.list();
      // Find the most recent active cycle (in VP review or HR review stage)
      const activeCycle = cycles.find(c => 
        c.status === 'vp_review_in_progress' || 
        c.status === 'hr_final_review' ||
        c.status === 'pending_vp_review' ||
        c.status === 'pending_pc_approval' ||
        c.status === 'pc_approved'
      );
      
      if (activeCycle) {
        setActiveCycleId(activeCycle.id);
        const { vpStatuses } = await reviewCyclesApi.get(activeCycle.id);
        const allocations: Record<string, { allocated: number; supplemental: number | null; status: string | null }> = {};
        vpStatuses.forEach(vp => {
          allocations[vp.vpStem] = {
            allocated: vp.allocatedBudget || 0,
            supplemental: vp.vpSupplementalOffer || null,
            status: vp.status || null,
          };
        });
        setVpAllocations(allocations);
      } else {
        setActiveCycleId(null);
        setVpAllocations({});
      }
    } catch (err) {
      // Silently fail - this is optional enhancement
      console.error('Failed to load VP allocations:', err);
    }
  }

  async function loadPendingReviews() {
    // Only load for non-institution-wide users (VPs)
    if (isInstitutionWide) return;
    try {
      const reviews = await reviewCyclesApi.getMyPendingReviews();
      const actionableReviews = reviews.filter(r => r.status === 'in_review' || r.status === 'hr_revised');
      
      // If there's an actionable review, set it as active
      if (actionableReviews.length > 0 && actionableReviews[0]) {
        const review = actionableReviews[0];
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
        
        // Initialize supplemental funding input with existing offer
        if (review.vpSupplementalOffer && review.vpSupplementalOffer > 0) {
          setVpSupplementalFunding(review.vpSupplementalOffer.toString());
          setSupplementalOfferNotes(review.supplementalOfferNotes || '');
        } else {
          setVpSupplementalFunding('');
          setSupplementalOfferNotes('');
        }
        
        // Load existing feedback for this cycle
        loadEmployeeFeedback(review.cycleId);
        
        // Load positions for this VP's review
        loadPositions(review.vpStem);
      } else {
        setActiveReview(null);
        setEmployeeFeedback({});
        setVpSupplementalFunding('');
        setSupplementalOfferNotes('');
      }
    } catch (err) {
      // Silently fail - this is not critical
      console.error('Failed to load pending reviews:', err);
    }
  }

  async function loadEmployeeFeedback(cycleId: number) {
    setFeedbackLoading(true);
    try {
      const feedback = await reviewCyclesApi.getEmployeeFeedback(cycleId);
      const feedbackMap: Record<number, EmployeeFeedback> = {};
      feedback.forEach((f: { positionMappingId: number; feedbackType: EmployeeFeedbackType; adjustedRaise: number | null; notes: string | null }) => {
        feedbackMap[f.positionMappingId] = {
          feedbackType: f.feedbackType,
          adjustedRaise: f.adjustedRaise,
          notes: f.notes,
        };
      });
      setEmployeeFeedback(feedbackMap);
    } catch (err) {
      console.error('Failed to load feedback:', err);
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function handleSaveFeedback(positionMappingId: number, feedbackType: EmployeeFeedbackType) {
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
      
      // Update local state
      setEmployeeFeedback(prev => ({
        ...prev,
        [positionMappingId]: {
          feedbackType,
          adjustedRaise: adjustedRaiseInput ? parseFloat(adjustedRaiseInput) : null,
          notes: feedbackNotes || null,
        },
      }));
      
      // Reset form
      setExpandedFeedback(null);
      setFeedbackNotes('');
      setAdjustedRaiseInput('');
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSavingFeedback(null);
    }
  }

  async function handleQuickFeedback(positionMappingId: number, feedbackType: EmployeeFeedbackType) {
    if (!activeReview) return;
    
    setSavingFeedback(positionMappingId);
    try {
      await reviewCyclesApi.saveEmployeeFeedback(
        activeReview.cycleId,
        positionMappingId,
        feedbackType
      );
      
      setEmployeeFeedback(prev => ({
        ...prev,
        [positionMappingId]: {
          feedbackType,
          adjustedRaise: null,
          notes: null,
        },
      }));
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSavingFeedback(null);
    }
  }

  async function handleApproveReview() {
    if (!activeReview) return;
    
    setIsSubmitting(true);
    try {
      // If VP has entered supplemental funding, automatically include it with the approval
      const supplementalAmount = parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
      if (supplementalAmount > 0) {
        await reviewCyclesApi.vpSubmitSupplementalOffer(
          activeReview.cycleId, 
          supplementalAmount, 
          supplementalOfferNotes || undefined
        );
      }
      
      await reviewCyclesApi.vpApprove(activeReview.cycleId, submitNotes || undefined);
      setShowApproveDialog(false);
      setActiveReview(null);
      setEmployeeFeedback({});
      setSubmitNotes('');
      setVpSupplementalFunding('');
      setSupplementalOfferNotes('');
      // Reload to check for more reviews
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
      setEmployeeFeedback({});
      setSubmitNotes('');
      loadPendingReviews();
    } catch (err) {
      console.error('Failed to request changes:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVpAutoAllocate() {
    if (!activeReview) return;
    
    const hrAllocated = activeReview.allocatedBudget || 0;
    const supplemental = parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
    const totalBudget = hrAllocated + supplemental;
    
    if (totalBudget <= 0) return;
    
    setIsAutoAllocating(true);
    try {
      // Use VP-specific endpoint that doesn't require editor permissions
      const result = await reviewCyclesApi.vpAutoAllocate(activeReview.cycleId, totalBudget);
      setLastAllocation({
        budget: totalBudget,
        allocated: result.allocated,
        positions: result.positionsUpdated,
      });
      // Reload positions to see updated raises - pass vpStem explicitly
      await loadPositions(activeReview.vpStem);
    } catch (err) {
      console.error('Failed to auto-allocate:', err);
    } finally {
      setIsAutoAllocating(false);
    }
  }

  async function handleVpClearRaises() {
    if (!activeReview) return;
    
    setIsClearingRaises(true);
    try {
      // Use VP-specific endpoint that doesn't require editor permissions
      await reviewCyclesApi.vpClearRaises(activeReview.cycleId);
      setLastAllocation(null);
      // Reload positions to see cleared raises - pass vpStem explicitly
      await loadPositions(activeReview.vpStem);
    } catch (err) {
      console.error('Failed to clear raises:', err);
    } finally {
      setIsClearingRaises(false);
    }
  }

  // Load positions when VP is selected or filters change
  useEffect(() => {
    if (selectedVp) {
      loadPositions();
    } else if (activeReview) {
      // For VPs in review mode without selectedVp set
      loadPositions(activeReview.vpStem);
    }
  }, [selectedVp, activeReview, compensationType, gapOnly, page]);

  async function loadSummaryData() {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryData, vpData, yearsData] = await Promise.all([
        equityAnalysisApi.getSummary(),
        equityAnalysisApi.getByVp(),
        equityAnalysisApi.getSalaryDataYears(),
      ]);
      setSummary(summaryData);
      setVpSummary(vpData);
      setSalaryYears(yearsData);
      if (yearsData.length > 0 && !selectedYear) {
        setSelectedYear(yearsData[0].data_year);
      }
    } catch (err) {
      console.error('Failed to load equity data:', err);
      setError('Failed to load equity analysis data');
    } finally {
      setIsLoading(false);
    }
  }

  // Auto-select VP division for non-institution-wide users (VPs)
  // This runs after data loads and when the user is determined
  useEffect(() => {
    if (!isInstitutionWide && vpSummary.length === 1 && !selectedVp && !isLoading) {
      setSelectedVp(vpSummary[0]);
    }
  }, [isInstitutionWide, vpSummary, selectedVp, isLoading]);

  async function loadPositions(overrideVpStem?: string) {
    // Use override vpStem if provided (for active review), otherwise use selectedVp
    const vpStem = overrideVpStem || selectedVp?.vpStem;
    if (!vpStem) return;
    
    setPositionsLoading(true);
    try {
      const positionsData = await equityAnalysisApi.getPositions({
        vpStem,
        compensationType: compensationType !== 'all' ? compensationType : undefined,
        gapOnly,
        page,
        limit,
      });
      setPositions(positionsData.data);
      setTotalPositionCount(positionsData.total);
      
      // Initialize editing state with current proposed raises
      const raises: { [key: number]: string } = {};
      positionsData.data.forEach(p => {
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

  async function handleCalculate() {
    if (!selectedYear) return;
    setIsCalculating(true);
    setError(null);
    try {
      const result = await equityAnalysisApi.calculate(selectedYear);
      if (result.success) {
        setShowCalculateDialog(false);
        setSelectedVp(null);
        await loadSummaryData();
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('Failed to calculate equity:', err);
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setIsCalculating(false);
    }
  }

  function handleVpClick(vp: EquitySummaryByVp) {
    if (selectedVp?.vpStem === vp.vpStem) {
      // Clicking same VP deselects
      setSelectedVp(null);
      setPositions([]);
    } else {
      setSelectedVp(vp);
      setPage(1);
      setCompensationType('all');
      setGapOnly(false);
    }
  }

  function handleBackToAll() {
    setSelectedVp(null);
    setPositions([]);
    loadSummaryData();
  }

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(raiseDebounceRef.current).forEach(clearTimeout);
    };
  }, []);

  // Compute effective raise from live input (editingRaise) or server state (proposedRaise)
  function getEffectiveRaise(positionMappingId: number, serverProposedRaise: number | null | undefined): number {
    const editValue = editingRaise[positionMappingId];
    if (editValue !== undefined && editValue !== '') {
      return parseFloat(editValue.replace(/[,$]/g, '')) || 0;
    }
    return serverProposedRaise || 0;
  }

  async function handleRaiseChange(positionMappingId: number, value: string) {
    setEditingRaise(prev => ({ ...prev, [positionMappingId]: value }));

    // Clear existing debounce timer
    if (raiseDebounceRef.current[positionMappingId]) {
      clearTimeout(raiseDebounceRef.current[positionMappingId]);
    }

    // Debounce API save (500ms after user stops typing)
    raiseDebounceRef.current[positionMappingId] = setTimeout(async () => {
      const amount = parseFloat(value?.replace(/[,$]/g, '') || '0');
      setSavingRaise(positionMappingId);
      try {
        await equityAnalysisApi.proposeRaise(positionMappingId, amount);
        setPositions(prev => prev.map(p =>
          p.positionMappingId === positionMappingId
            ? { ...p, proposedRaise: amount }
            : p
        ));
      } catch (err) {
        console.error('Failed to save raise:', err);
      } finally {
        setSavingRaise(null);
        delete raiseDebounceRef.current[positionMappingId];
      }
    }, 500);
  }

  async function handleRaiseBlur(positionMappingId: number) {
    // Cancel any pending debounce - save immediately on blur
    if (raiseDebounceRef.current[positionMappingId]) {
      clearTimeout(raiseDebounceRef.current[positionMappingId]);
      delete raiseDebounceRef.current[positionMappingId];
    }

    const value = editingRaise[positionMappingId];
    const amount = parseFloat(value?.replace(/[,$]/g, '') || '0');
    
    setSavingRaise(positionMappingId);
    try {
      await equityAnalysisApi.proposeRaise(positionMappingId, amount);
      setPositions(prev => prev.map(p => 
        p.positionMappingId === positionMappingId 
          ? { ...p, proposedRaise: amount }
          : p
      ));
    } catch (err) {
      console.error('Failed to save raise:', err);
    } finally {
      setSavingRaise(null);
    }
  }

  async function handleBudgetAllocated() {
    await loadSummaryData();
    if (selectedVp) {
      await loadPositions();
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const hasAnalysis = summary && summary.analyzedPositions > 0;
  const hasNoData = !summary || summary.totalPositions === 0;

  // Calculate displayed stats - either overall or VP-specific
  const displayStats = selectedVp ? {
    totalGap: selectedVp.totalGap,
    averageGap: selectedVp.averageGap,
    medianGap: null as number | null,
    analyzedPositions: selectedVp.analyzedCount,
    totalPositions: selectedVp.positionCount,
    positionsWithGap: selectedVp.underpaidCount,
    totalProposedRaises: positions.reduce((sum, p) => sum + getEffectiveRaise(p.positionMappingId, p.proposedRaise), 0),
  } : {
    totalGap: summary?.totalGap || 0,
    averageGap: summary?.averageGap || 0,
    medianGap: summary?.medianGap || null,
    analyzedPositions: summary?.analyzedPositions || 0,
    totalPositions: summary?.totalPositions || 0,
    positionsWithGap: summary?.positionsWithGap || 0,
    totalProposedRaises: null as number | null,
  };

  const totalPages = Math.ceil(totalPositionCount / limit);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main Content */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Only show back button for institution-wide users viewing a specific VP */}
            {selectedVp && isInstitutionWide && (
              <Button variant="outline" onClick={handleBackToAll} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                All Divisions
              </Button>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {selectedVp ? selectedVp.vpTitle || selectedVp.vpStem : 'Equity Dashboard'}
              </h1>
              <p className="text-muted-foreground">
                {selectedVp 
                  ? (isInstitutionWide ? 'Position equity details' : 'Equity analysis for your division')
                  : isInstitutionWide 
                    ? 'Institution-wide compensation equity analysis'
                    : 'Equity analysis for your division'
                }
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedVp && (
              <>
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
                <Button variant="outline" size="sm" onClick={() => equityAnalysisApi.export()}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </>
            )}
            {!selectedVp && (
              <>
                <Button variant="outline" onClick={loadSummaryData} size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Dialog open={showCalculateDialog} onOpenChange={setShowCalculateDialog}>
                  <DialogTrigger asChild>
                    <Button variant={hasAnalysis ? 'outline' : 'default'} size="sm">
                      <Calculator className="h-4 w-4 mr-2" />
                      {hasAnalysis ? 'Recalculate' : 'Run Analysis'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Run Equity Analysis</DialogTitle>
                      <DialogDescription>
                        Calculate equity gaps for all positions using CUPA salary data
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>CUPA Salary Data Year</Label>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                          <SelectContent>
                            {salaryYears.map(y => (
                              <SelectItem key={y.data_year} value={y.data_year}>
                                {y.data_year} ({y.count} codes)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {salaryYears.length === 0 && (
                          <p className="text-sm text-destructive mt-1">
                            No CUPA salary data imported. Please import salary data first.
                          </p>
                        )}
                      </div>
                      {error && showCalculateDialog && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                          {error}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCalculateDialog(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleCalculate} 
                        disabled={!selectedYear || isCalculating || salaryYears.length === 0}
                      >
                        {isCalculating ? 'Calculating...' : 'Calculate'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>

        {error && !showCalculateDialog && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Active Review Banner for VPs */}
        {!isInstitutionWide && activeReview && (
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
            <ClipboardCheck className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-900 dark:text-blue-100">
              {activeReview.cycleName} - Review Mode Active
            </AlertTitle>
            <AlertDescription>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-4 text-sm text-blue-800 dark:text-blue-200">
                  <span>Budget: {formatCurrency(activeReview.allocatedBudget)}</span>
                  {activeReview.deadline && (
                    <span>Due: {new Date(activeReview.deadline).toLocaleDateString()}</span>
                  )}
                  <span>
                    Reviewed: {Object.keys(employeeFeedback).length} / {positions.length} employees
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Dialog open={showRequestChangesDialog} onOpenChange={setShowRequestChangesDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
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
                        <Button variant="outline" onClick={() => setShowRequestChangesDialog(false)}>Cancel</Button>
                        <Button onClick={handleRequestChanges} disabled={!submitNotes.trim() || isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Submit Request
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700">
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
                      <div className="py-4">
                        <Label htmlFor="approve-notes">Notes (optional)</Label>
                        <Textarea
                          id="approve-notes"
                          placeholder="Any notes for HR..."
                          value={submitNotes}
                          onChange={(e) => setSubmitNotes(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
                        <Button onClick={handleApproveReview} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Confirm Approval
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {hasNoData ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No position data</p>
              <p className="text-muted-foreground mb-4">
                Import position data to begin equity analysis
              </p>
              <Button onClick={() => navigate('/import')}>
                Import Data
              </Button>
            </CardContent>
          </Card>
        ) : !hasAnalysis ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No equity analysis yet</p>
              <p className="text-muted-foreground mb-4">
                Run the equity calculator to analyze compensation gaps
              </p>
              <Button onClick={() => setShowCalculateDialog(true)}>
                <Calculator className="h-4 w-4 mr-2" />
                Run Analysis
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards - Unified format */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(displayStats.totalGap)}</div>
                  <p className="text-xs text-muted-foreground">Total Gap</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{formatCurrency(displayStats.averageGap)}</div>
                  <p className="text-xs text-muted-foreground">Average Gap</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">{displayStats.positionsWithGap}</div>
                  <p className="text-xs text-muted-foreground">Underpaid</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">
                    {displayStats.analyzedPositions - displayStats.positionsWithGap}
                  </div>
                  <p className="text-xs text-muted-foreground">At/Above Median</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-blue-600">
                    {selectedVp ? formatCurrency(displayStats.totalProposedRaises) : formatCurrency(0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Proposed Raises</p>
                </CardContent>
              </Card>
            </div>

            {/* VP Breakdown - Show when no VP selected */}
            {!selectedVp && (
              <Card>
                <CardHeader>
                  <CardTitle>Gap by VP Division</CardTitle>
                  <CardDescription>
                    Click a division to see individual positions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {vpSummary.map(vp => {
                      const gapPercentOfTotal = summary && summary.totalGap > 0 
                        ? (vp.totalGap / summary.totalGap) * 100 
                        : 0;
                      
                      return (
                        <div 
                          key={vp.vpStem} 
                          className="p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 cursor-pointer transition-colors group"
                          onClick={() => handleVpClick(vp)}
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
                                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
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
                                  {vp.analyzedCount} of {vp.positionCount} analyzed
                                  {' • '}
                                  <span className="text-blue-600">{vp.salariedCount} salaried</span>
                                  {' • '}
                                  <span className="text-purple-600">{vp.hourlyCount} hourly</span>
                                </div>
                                {vpAllocations[vp.vpStem] && (
                                  <div className="text-sm text-green-600 font-medium">
                                    Allocated: {formatCurrency(vpAllocations[vp.vpStem].allocated || 0)}
                                    {vpAllocations[vp.vpStem].supplemental && vpAllocations[vp.vpStem].supplemental! > 0 && (
                                      <span className="text-blue-600"> (+{formatCurrency(vpAllocations[vp.vpStem].supplemental!)} VP offer)</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="font-semibold text-red-600 text-lg">{formatCurrency(vp.totalGap)}</div>
                                <div className="text-sm text-muted-foreground">
                                  Avg: {formatCurrency(vp.averageGap)} ({formatPercent(vp.averageGapPercentage)})
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
            )}

            {/* Position Details - Show when VP is selected */}
            {selectedVp && (
              <>
                {/* Filters */}
                <div className="flex gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Filters:</span>
                  </div>
                  <Select value={compensationType} onValueChange={v => { setCompensationType(v); setPage(1); }}>
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
                    onClick={() => { setGapOnly(!gapOnly); setPage(1); }}
                  >
                    Underpaid Only
                  </Button>
                  <span className="text-sm text-muted-foreground ml-auto">
                    {totalPositionCount} position{totalPositionCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Positions Display */}
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
                  /* Visual Cards View */
                  <div className="space-y-3">
                    {positions.map(pos => {
                      const percentOfMedian = pos.currentSalary && pos.adjustedMedian 
                        ? (pos.currentSalary / pos.adjustedMedian) * 100 
                        : null;
                      const isUnderpaid = percentOfMedian !== null && percentOfMedian < 95;
                      const isOverpaid = percentOfMedian !== null && percentOfMedian > 105;
                      const effectiveRaise = getEffectiveRaise(pos.positionMappingId, pos.proposedRaise);
                      const newSalary = pos.currentSalary && effectiveRaise > 0
                        ? pos.currentSalary + effectiveRaise 
                        : pos.currentSalary;
                      const remainingGap = pos.equityGap !== null && effectiveRaise > 0
                        ? pos.equityGap - effectiveRaise
                        : pos.equityGap;
                      
                      return (
                        <Card 
                          key={pos.id} 
                          className={
                            isUnderpaid ? 'border-l-4 border-l-red-500' : 
                            isOverpaid ? 'border-l-4 border-l-green-500' : 
                            'border-l-4 border-l-blue-500'
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
                                    <div className="text-xs truncate" title={pos.cupaTitle || ''}>{pos.cupaTitle}</div>
                                  </>
                                ) : (
                                  <Badge variant="outline" className="text-xs">No CUPA Code</Badge>
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
                                      <span className={pos.equityGap && pos.equityGap > 0 ? 'text-red-600' : 'text-green-600'}>
                                        {formatCurrency(pos.equityGap)}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Proposed Raise Input */}
                                  <div className="space-y-1">
                                    <div className="text-xs text-muted-foreground">Proposed Raise:</div>
                                    <Input
                                      type="text"
                                      placeholder="$0"
                                      value={editingRaise[pos.positionMappingId] || ''}
                                      onChange={(e) => handleRaiseChange(pos.positionMappingId, e.target.value)}
                                      onBlur={() => handleRaiseBlur(pos.positionMappingId)}
                                      className={`h-7 text-xs font-mono ${savingRaise === pos.positionMappingId ? 'opacity-50' : ''}`}
                                      disabled={savingRaise === pos.positionMappingId}
                                    />
                                    {effectiveRaise > 0 && (
                                      <div className="text-xs">
                                        <span className="text-muted-foreground">New: </span>
                                        <span className="font-mono text-blue-600">{formatCurrency(newSalary)}</span>
                                        <span className="text-muted-foreground ml-2">Gap: </span>
                                        <span className={`font-mono ${remainingGap && remainingGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          {formatCurrency(remainingGap)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Badges row */}
                            <div className="mt-2 pt-2 border-t flex flex-wrap gap-1 items-center">
                              <Badge variant="secondary" className="text-xs">{pos.compensationType}</Badge>
                              {pos.fte < 1 && (
                                <Badge variant="outline" className="text-xs">{(pos.fte * 100).toFixed(0)}% FTE</Badge>
                              )}
                              {pos.appointmentMonths < 12 && (
                                <Badge variant="outline" className="text-xs">{pos.appointmentMonths}-month</Badge>
                              )}
                              {pos.yearsInRole !== null && (
                                <Badge variant="outline" className="text-xs">Year {pos.yearsInRole.toFixed(1)}</Badge>
                              )}
                              {pos.hasHousingBenefit && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Housing Benefit</Badge>
                              )}
                              
                              {/* Review Feedback UI */}
                              {activeReview && (
                                <div className="ml-auto flex items-center gap-1">
                                  {employeeFeedback[pos.positionMappingId] && (
                                    <Badge 
                                      variant="outline" 
                                      className={feedbackOptions.find(f => f.type === employeeFeedback[pos.positionMappingId]?.feedbackType)?.color}
                                    >
                                      {feedbackOptions.find(f => f.type === employeeFeedback[pos.positionMappingId]?.feedbackType)?.label}
                                    </Badge>
                                  )}
                                  {savingFeedback === pos.positionMappingId ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  ) : (
                                    feedbackOptions.slice(0, 3).map(opt => (
                                      <Button
                                        key={opt.type}
                                        variant="outline"
                                        size="sm"
                                        className={`h-6 px-2 text-xs ${employeeFeedback[pos.positionMappingId]?.feedbackType === opt.type ? opt.color : ''}`}
                                        onClick={() => handleQuickFeedback(pos.positionMappingId, opt.type)}
                                        title={opt.label}
                                      >
                                        <opt.icon className="h-3 w-3" />
                                      </Button>
                                    ))
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      if (expandedFeedback === pos.positionMappingId) {
                                        setExpandedFeedback(null);
                                      } else {
                                        setExpandedFeedback(pos.positionMappingId);
                                        setFeedbackNotes(employeeFeedback[pos.positionMappingId]?.notes || '');
                                        setAdjustedRaiseInput(employeeFeedback[pos.positionMappingId]?.adjustedRaise?.toString() || '');
                                      }
                                    }}
                                    title="More options"
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            
                            {/* Expanded Feedback Form */}
                            {activeReview && expandedFeedback === pos.positionMappingId && (
                              <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3">
                                <div className="flex flex-wrap gap-1">
                                  {feedbackOptions.map(opt => (
                                    <Button
                                      key={opt.type}
                                      variant="outline"
                                      size="sm"
                                      className={`h-7 px-2 text-xs ${employeeFeedback[pos.positionMappingId]?.feedbackType === opt.type ? 'ring-2 ring-primary ' : ''}${opt.color}`}
                                      onClick={() => handleSaveFeedback(pos.positionMappingId, opt.type)}
                                    >
                                      <opt.icon className="h-3 w-3 mr-1" />
                                      {opt.label}
                                    </Button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">Adjusted Raise</Label>
                                    <Input
                                      type="text"
                                      placeholder={formatCurrency(pos.proposedRaise)}
                                      value={adjustedRaiseInput}
                                      onChange={(e) => setAdjustedRaiseInput(e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Notes</Label>
                                    <Input
                                      type="text"
                                      placeholder="Optional note..."
                                      value={feedbackNotes}
                                      onChange={(e) => setFeedbackNotes(e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
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
                            {positions.map(pos => {
                              const tableEffectiveRaise = getEffectiveRaise(pos.positionMappingId, pos.proposedRaise);
                              return (
                              <tr key={pos.id} className="border-t hover:bg-muted/30">
                                <td className="p-3">
                                  <div className="font-medium">{pos.employeeName}</div>
                                  <div className="text-xs text-muted-foreground">{pos.employeeId}</div>
                                </td>
                                <td className="p-3">
                                  <div>{pos.institutionalTitle}</div>
                                  <div className="text-xs text-muted-foreground">{pos.department}</div>
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
                                  <span className={pos.equityGap && pos.equityGap > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                    {formatCurrency(pos.equityGap)}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <Input
                                    type="text"
                                    placeholder="$0"
                                    value={editingRaise[pos.positionMappingId] || ''}
                                    onChange={(e) => handleRaiseChange(pos.positionMappingId, e.target.value)}
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
                      Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalPositionCount)} of {totalPositionCount}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Right Panel - Different for VPs in review mode vs HR */}
      {hasAnalysis && (
        <div className="lg:block hidden">
          {activeReview ? (
            /* VP Review Summary Panel */
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Your Review</CardTitle>
                </div>
                <CardDescription>{activeReview.cycleName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Budget Section */}
                {(() => {
                  const hrAllocated = activeReview.allocatedBudget || 0;
                  const supplemental = parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
                  const totalBudget = hrAllocated + supplemental;
                  const totalProposed = positions.reduce((sum, p) => sum + getEffectiveRaise(p.positionMappingId, p.proposedRaise), 0);
                  const remaining = totalBudget - totalProposed;
                  const isOverBudget = remaining < 0;
                  
                  return (
                    <>
                      {/* HR Allocated Budget */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                        <div className="text-sm text-muted-foreground">HR Allocated Budget</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {formatCurrency(hrAllocated)}
                        </div>
                      </div>

                      {/* Add Your Funding */}
                      <div className="p-3 rounded-lg border-2 bg-purple-50 dark:bg-purple-950/30 border-dashed border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Calculator className="h-4 w-4 text-purple-600" />
                          <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                            Add Your Funding
                          </span>
                        </div>
                        
                        <Input
                          type="text"
                          placeholder="$0"
                          value={vpSupplementalFunding}
                          onChange={(e) => setVpSupplementalFunding(e.target.value)}
                          className="font-mono bg-white dark:bg-gray-900"
                        />
                        
                        {/* Notes for offer */}
                        {supplemental > 0 && (
                          <Textarea
                            placeholder="Add a note for HR (optional)..."
                            value={supplementalOfferNotes}
                            onChange={(e) => setSupplementalOfferNotes(e.target.value)}
                            className="mt-2 text-sm"
                            rows={2}
                          />
                        )}
                        
                        {/* Info message */}
                        <p className="text-xs text-muted-foreground mt-2">
                          {supplemental > 0 
                            ? `This ${formatCurrency(supplemental)} will be included when you approve the review`
                            : 'Enter an amount to contribute departmental funds'
                          }
                        </p>
                      </div>

                      {/* Combined Total (if supplemental added) */}
                      {supplemental > 0 && (
                        <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                          <div className="text-sm text-muted-foreground">Combined Total Budget</div>
                          <div className="text-xl font-bold text-green-600">
                            {formatCurrency(totalBudget)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(hrAllocated)} HR + {formatCurrency(supplemental)} yours
                            {activeReview.vpSupplementalOffer && ' (offered)'}
                          </div>
                        </div>
                      )}

                      {/* Auto-Assign Actions */}
                      <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Wand2 className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Auto-Assign Budget</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleVpAutoAllocate}
                            disabled={isAutoAllocating || totalBudget <= 0}
                            className="flex-1"
                          >
                            {isAutoAllocating ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Wand2 className="h-4 w-4 mr-1" />
                            )}
                            Auto-Assign
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleVpClearRaises}
                            disabled={isClearingRaises || totalProposed === 0}
                            className="flex-1"
                          >
                            {isClearingRaises ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-1" />
                            )}
                            Clear
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Distribute {formatCurrency(totalBudget)} across employees with gaps
                        </p>
                        {lastAllocation && (
                          <div className="text-xs text-green-600 bg-green-50 dark:bg-green-950/30 p-2 rounded">
                            <CheckCircle2 className="h-3 w-3 inline mr-1" />
                            Allocated {formatCurrency(lastAllocation.allocated)} to {lastAllocation.positions} employees
                          </div>
                        )}
                      </div>

                      {/* Proposed Total */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Proposed Raises</span>
                          <span className="font-mono font-medium">
                            {formatCurrency(totalProposed)}
                          </span>
                        </div>
                        
                        {/* Budget comparison */}
                        <div className={`p-3 rounded-lg ${isOverBudget ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
                          <div className="flex justify-between text-sm">
                            <span className={isOverBudget ? 'text-red-600' : 'text-green-600'}>
                              {isOverBudget ? 'Over Budget' : 'Remaining'}
                            </span>
                            <span className={`font-mono font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                              {isOverBudget ? '+' : ''}{formatCurrency(Math.abs(remaining))}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, totalBudget > 0 ? (totalProposed / totalBudget) * 100 : 0)}%` }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground text-right">
                            {totalBudget > 0 ? ((totalProposed / totalBudget) * 100).toFixed(0) : 0}% of budget
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Review Progress */}
                <div className="pt-3 border-t">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Review Progress</span>
                    <span className="font-medium">
                      {Object.keys(employeeFeedback).length} / {positions.length}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ width: `${positions.length > 0 ? (Object.keys(employeeFeedback).length / positions.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Deadline */}
                {activeReview.deadline && (
                  <div className="pt-3 border-t text-sm">
                    <span className="text-muted-foreground">Due: </span>
                    <span className="font-medium">
                      {new Date(activeReview.deadline).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* HR Budget Adjustment Panel */
            <AdjustmentPanel 
              totalGap={selectedVp ? selectedVp.totalGap : (summary?.totalGap || 0)}
              vpFilter={selectedVp?.vpStem}
              onBudgetAllocated={handleBudgetAllocated}
              vpAllocatedBudget={selectedVp && vpAllocations[selectedVp.vpStem]?.allocated}
              vpSupplementalOffer={selectedVp && vpAllocations[selectedVp.vpStem]?.supplemental}
              vpReviewStatus={selectedVp && vpAllocations[selectedVp.vpStem]?.status}
              activeCycleId={activeCycleId}
              onVpReviewApproved={loadVpAllocations}
            />
          )}
        </div>
      )}

      {/* Mobile: Show panel below */}
      {hasAnalysis && (
        <div className="lg:hidden">
          {activeReview ? (
            /* VP Review Summary - Mobile */
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Your Review: {activeReview.cycleName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-muted-foreground">Allocated</div>
                    <div className="text-lg font-bold text-blue-600">{formatCurrency(activeReview.allocatedBudget)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Proposed</div>
                    <div className="text-lg font-bold">
                      {formatCurrency(positions.reduce((sum, p) => sum + getEffectiveRaise(p.positionMappingId, p.proposedRaise), 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Reviewed</div>
                    <div className="text-lg font-bold">{Object.keys(employeeFeedback).length}/{positions.length}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <AdjustmentPanel 
              totalGap={selectedVp ? selectedVp.totalGap : (summary?.totalGap || 0)}
              vpFilter={selectedVp?.vpStem}
              onBudgetAllocated={handleBudgetAllocated}
              vpAllocatedBudget={selectedVp && vpAllocations[selectedVp.vpStem]?.allocated}
              vpSupplementalOffer={selectedVp && vpAllocations[selectedVp.vpStem]?.supplemental}
              vpReviewStatus={selectedVp && vpAllocations[selectedVp.vpStem]?.status}
              activeCycleId={activeCycleId}
              onVpReviewApproved={loadVpAllocations}
            />
          )}
        </div>
      )}
    </div>
  );
}
