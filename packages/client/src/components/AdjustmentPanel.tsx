import { useState, useEffect } from 'react';
import { DollarSign, Wand2, Trash2, TrendingUp, Users, RefreshCw, CheckCircle, CheckCircle2, Send, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { equityAnalysisApi, reviewCyclesApi } from '@/services/api';

interface ProposedRaise {
  positionMappingId: number;
  employeeName: string;
  vpStem: string;
  currentSalary: number | null;
  equityGap: number | null;
  proposedRaise: number;
  newSalary: number | null;
  remainingGap: number | null;
}

interface AdjustmentPanelProps {
  totalGap: number;
  onBudgetAllocated?: () => void;
  vpFilter?: string;
  vpAllocatedBudget?: number | null;  // When viewing a specific VP during a review cycle
  vpSupplementalOffer?: number | null; // VP's supplemental funding offer
  vpReviewStatus?: string | null; // VP's review status in the current cycle
  activeCycleId?: number | null; // Active review cycle ID
  onVpReviewApproved?: () => void; // Callback when HR approves a VP's review
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function AdjustmentPanel({ 
  totalGap, 
  onBudgetAllocated, 
  vpFilter, 
  vpAllocatedBudget, 
  vpSupplementalOffer,
  vpReviewStatus,
  activeCycleId,
  onVpReviewApproved 
}: AdjustmentPanelProps) {
  const [budgetAmount, setBudgetAmount] = useState('');
  const [proposedRaises, setProposedRaises] = useState<ProposedRaise[]>([]);
  const [isAllocating, setIsAllocating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApprovingVp, setIsApprovingVp] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [lastAllocation, setLastAllocation] = useState<{ budget: number; allocated: number; positions: number } | null>(null);
  const [lastSubmission, setLastSubmission] = useState<{ employeesUpdated: number; totalRaises: number; dataYear: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Calculate combined budget for this VP (HR allocation + VP supplemental)
  const vpTotalBudget = vpAllocatedBudget ? (vpAllocatedBudget + (vpSupplementalOffer || 0)) : null;
  
  // Check if this VP review is already finalized
  const isVpFinalized = vpReviewStatus === 'finalized';
  
  // Check if we're viewing a VP with an active review that needs HR approval (not already finalized)
  const showVpApproveButton = vpFilter && vpAllocatedBudget !== undefined && vpAllocatedBudget !== null && activeCycleId && !isVpFinalized;

  useEffect(() => {
    loadProposedRaises();
  }, [vpFilter]);
  
  // Pre-fill budget amount with VP's allocation if available
  useEffect(() => {
    if (vpTotalBudget && !budgetAmount) {
      setBudgetAmount(vpTotalBudget.toString());
    }
  }, [vpTotalBudget]);

  async function loadProposedRaises() {
    try {
      const raises = await equityAnalysisApi.getProposedRaises();
      // Filter by VP if needed
      const filtered = vpFilter 
        ? raises.filter(r => r.vpStem === vpFilter)
        : raises;
      setProposedRaises(filtered);
    } catch (err) {
      console.error('Failed to load proposed raises:', err);
    }
  }

  async function handleAutoAllocate() {
    const amount = parseFloat(budgetAmount.replace(/[,$]/g, ''));
    if (isNaN(amount) || amount <= 0) return;
    
    setIsAllocating(true);
    try {
      const result = await equityAnalysisApi.autoAllocate(amount, vpFilter);
      setLastAllocation({
        budget: amount,
        allocated: result.allocated,
        positions: result.positionsUpdated,
      });
      await loadProposedRaises();
      onBudgetAllocated?.();
    } catch (err) {
      console.error('Failed to allocate budget:', err);
    } finally {
      setIsAllocating(false);
    }
  }

  async function handleClearRaises() {
    setIsClearing(true);
    try {
      await equityAnalysisApi.clearRaises(vpFilter);
      setProposedRaises([]);
      setLastAllocation(null);
      onBudgetAllocated?.();
    } catch (err) {
      console.error('Failed to clear raises:', err);
    } finally {
      setIsClearing(false);
    }
  }

  async function handleSubmitReview() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await equityAnalysisApi.submitReview(vpFilter, reviewNotes || undefined);
      setLastSubmission({
        employeesUpdated: result.employeesUpdated,
        totalRaises: result.totalRaisesApproved,
        dataYear: result.dataYear,
      });
      setSubmitDialogOpen(false);
      setReviewNotes('');
      // Refresh data after submission
      onBudgetAllocated?.();
    } catch (err: unknown) {
      console.error('Failed to submit review:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit review';
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApproveVpReview() {
    if (!activeCycleId || !vpFilter) return;
    
    setIsApprovingVp(true);
    setSubmitError(null);
    try {
      await reviewCyclesApi.hrApproveVp(activeCycleId, vpFilter, reviewNotes || undefined);
      setApproveDialogOpen(false);
      setReviewNotes('');
      // Notify parent to refresh data
      onVpReviewApproved?.();
    } catch (err: unknown) {
      console.error('Failed to approve VP review:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to approve VP review';
      setSubmitError(errorMessage);
    } finally {
      setIsApprovingVp(false);
    }
  }

  const totalProposedRaises = proposedRaises.reduce((sum, r) => sum + r.proposedRaise, 0);
  const totalRemainingGap = proposedRaises.reduce((sum, r) => sum + (r.remainingGap || 0), 0);
  const gapCovered = totalGap > 0 ? ((totalGap - totalRemainingGap) / totalGap) * 100 : 0;

  return (
    <Card className="sticky top-4 max-h-[calc(100vh-2rem)] flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Budget Adjustment
        </CardTitle>
        <CardDescription>
          Allocate equity budget to employees
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 overflow-y-auto flex-1">
        {/* VP Allocated Budget Display (when viewing a specific VP during review) */}
        {vpAllocatedBudget !== undefined && vpAllocatedBudget !== null && (
          <div className="space-y-2">
            <div className={`p-3 rounded-lg ${isVpFinalized ? 'bg-green-50 dark:bg-green-950/30' : 'bg-blue-50 dark:bg-blue-950/30'}`}>
              {isVpFinalized && (
                <Badge className="mb-2 bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Approved
                </Badge>
              )}
              <div className="text-sm text-muted-foreground">Allocated to this Division</div>
              <div className={`text-2xl font-bold ${isVpFinalized ? 'text-green-600' : 'text-blue-600'}`}>
                {formatCurrency(vpAllocatedBudget)}
              </div>
              {vpSupplementalOffer && vpSupplementalOffer > 0 && (
                <div className="mt-1">
                  <span className="text-sm text-green-600 font-medium">
                    + {formatCurrency(vpSupplementalOffer)} VP offered
                  </span>
                  <div className="text-lg font-bold text-green-600 mt-1">
                    = {formatCurrency(vpTotalBudget)} total
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Budget Input */}
        <div className="space-y-2">
          <Label htmlFor="budget">
            {vpAllocatedBudget !== undefined && vpAllocatedBudget !== null 
              ? 'Adjust Budget' 
              : 'Total Equity Budget'}
          </Label>
          <div className="flex gap-2">
            <Input
              id="budget"
              type="text"
              placeholder={vpTotalBudget ? formatCurrency(vpTotalBudget) : "$100,000"}
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleAutoAllocate} 
              disabled={isAllocating || !budgetAmount}
              size="sm"
            >
              <Wand2 className="h-4 w-4 mr-1" />
              {isAllocating ? 'Allocating...' : 'Auto'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-allocate distributes budget proportionally based on equity gaps
          </p>
        </div>

        <Separator />

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Gap</div>
            <div className="text-lg font-semibold text-red-600">{formatCurrency(totalGap)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Proposed Raises</div>
            <div className="text-lg font-semibold text-green-600">{formatCurrency(totalProposedRaises)}</div>
          </div>
        </div>

        {/* Gap Coverage Progress */}
        {totalProposedRaises > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Gap Coverage</span>
              <span className="font-medium">{gapCovered.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, gapCovered)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Remaining: {formatCurrency(totalRemainingGap)}</span>
              <span>{proposedRaises.length} employees</span>
            </div>
          </div>
        )}

        {/* Last Allocation Info */}
        {lastAllocation && (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
              <TrendingUp className="h-4 w-4" />
              <span className="font-medium">Budget Allocated</span>
            </div>
            <div className="mt-1 text-xs text-green-600 dark:text-green-300">
              {formatCurrency(lastAllocation.allocated)} distributed across {lastAllocation.positions} positions
            </div>
          </div>
        )}

        {/* Proposed Raises Summary */}
        {proposedRaises.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Proposed Raises ({proposedRaises.length})
                </Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={loadProposedRaises}
                  className="h-7 px-2"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {proposedRaises.slice(0, 5).map((raise) => (
                  <div 
                    key={raise.positionMappingId}
                    className="flex items-center justify-between text-sm bg-muted/30 rounded p-2"
                  >
                    <div className="truncate flex-1 mr-2">
                      <div className="font-medium truncate">{raise.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{raise.vpStem}</div>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      +{formatCurrency(raise.proposedRaise)}
                    </Badge>
                  </div>
                ))}
                {proposedRaises.length > 5 && (
                  <div className="text-xs text-muted-foreground text-center py-1">
                    +{proposedRaises.length - 5} more employees
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Submit Review Success Message */}
        {lastSubmission && (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">Review Submitted</span>
            </div>
            <div className="mt-1 text-xs text-green-600 dark:text-green-300">
              {formatCurrency(lastSubmission.totalRaises)} in raises approved for {lastSubmission.employeesUpdated} employees ({lastSubmission.dataYear})
            </div>
          </div>
        )}

        {/* HR Approve VP Review Button - shown when HR is viewing a VP division during active review */}
        {showVpApproveButton && (
          <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve Review
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Approve VP Review</DialogTitle>
                <DialogDescription>
                  This will finalize and approve the {vpFilter} division's equity review allocations.
                  The VP's proposed raises will be locked in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="bg-muted rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Employees</div>
                      <div className="text-lg font-semibold">{proposedRaises.length}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Raises</div>
                      <div className="text-lg font-semibold text-green-600">{formatCurrency(totalProposedRaises)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Allocated Budget</div>
                      <div className="text-lg font-semibold text-blue-600">{formatCurrency(vpTotalBudget)}</div>
                    </div>
                    {vpSupplementalOffer && vpSupplementalOffer > 0 && (
                      <div>
                        <div className="text-muted-foreground">VP Supplemental</div>
                        <div className="text-lg font-semibold text-green-600">{formatCurrency(vpSupplementalOffer)}</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="approve-notes">Approval Notes (optional)</Label>
                  <Textarea 
                    id="approve-notes"
                    placeholder="Add any notes about this approval..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
                {submitError && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {submitError}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setApproveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="button"
                  onClick={handleApproveVpReview} 
                  disabled={isApprovingVp}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isApprovingVp ? 'Approving...' : 'Approve Review'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Submit Review Button - only shown when not in formal review cycle mode */}
        {proposedRaises.length > 0 && !showVpApproveButton && !activeCycleId && (
          <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-green-600 hover:bg-green-700">
                <Send className="h-4 w-4 mr-2" />
                Submit Review
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Equity Review</DialogTitle>
                <DialogDescription>
                  This will finalize and save the proposed raises as the completed review for {vpFilter ? `the ${vpFilter} division` : 'all divisions'}. 
                  These raises will be recorded in the review history.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="bg-muted rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Employees</div>
                      <div className="text-lg font-semibold">{proposedRaises.length}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Raises</div>
                      <div className="text-lg font-semibold text-green-600">{formatCurrency(totalProposedRaises)}</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Review Notes (optional)</Label>
                  <Textarea 
                    id="notes"
                    placeholder="Add any notes about this equity review..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
                {submitError && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {submitError}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSubmitDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="button"
                  onClick={handleSubmitReview} 
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Clear Button */}
        {proposedRaises.length > 0 && (
          <Button 
            variant="outline" 
            className="w-full text-destructive hover:text-destructive"
            onClick={handleClearRaises}
            disabled={isClearing}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isClearing ? 'Clearing...' : 'Clear All Raises'}
          </Button>
        )}

        {/* Export Button */}
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => equityAnalysisApi.export()}
        >
          Export to Excel
        </Button>
      </CardContent>
    </Card>
  );
}
