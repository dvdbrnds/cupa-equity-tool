import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Calendar, 
  DollarSign, 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Send,
  Archive,
  CheckCircle,
  Building2,
  MessageSquare,
  RefreshCw,
  Wand2,
  Vote,
  FileCheck,
  XCircle,
  Gavel,
  Trash2,
  Pencil,
  Check,
  X,
  FileDown
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { reviewCyclesApi } from '@/services/api';
import { ReviewStepper } from '@/components/review/ReviewStepper';
import type { EquityReviewCycleWithStats, VpReviewStatusRecord, ReviewCycleStatus, VpReviewStatus } from '@cupa/shared';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function getStatusBadge(status: ReviewCycleStatus) {
  const variants: Record<ReviewCycleStatus, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
    draft: { variant: 'secondary', label: 'Draft' },
    calculating: { variant: 'secondary', label: 'Calculating' },
    pending_vp_review: { variant: 'outline', label: 'Pending VP Review' },
    vp_review_in_progress: { variant: 'default', label: 'VP Review In Progress' },
    hr_final_review: { variant: 'default', label: 'HR Final Review' },
    pending_pc_approval: { variant: 'outline', label: 'Pending PC Vote' },
    pc_approved: { variant: 'default', label: 'PC Approved' },
    pc_rejected: { variant: 'destructive', label: 'PC Rejected' },
    approved: { variant: 'default', label: 'Approved' },
    implemented: { variant: 'default', label: 'Implemented' },
    archived: { variant: 'secondary', label: 'Archived' },
  };
  
  const config = variants[status] || variants.draft;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function getVpStatusBadge(status: VpReviewStatus) {
  const variants: Record<VpReviewStatus, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string; icon: React.ReactNode }> = {
    pending: { variant: 'secondary', label: 'Not Sent', icon: <Clock className="h-3 w-3" /> },
    in_review: { variant: 'outline', label: 'Awaiting Review', icon: <Users className="h-3 w-3" /> },
    approved: { variant: 'default', label: 'Approved', icon: <CheckCircle className="h-3 w-3" /> },
    changes_requested: { variant: 'destructive', label: 'Changes Requested', icon: <MessageSquare className="h-3 w-3" /> },
    hr_revised: { variant: 'outline', label: 'HR Revised', icon: <RefreshCw className="h-3 w-3" /> },
    finalized: { variant: 'default', label: 'Finalized', icon: <CheckCircle className="h-3 w-3" /> },
  };
  
  const config = variants[status] || variants.pending;
  return (
    <Badge variant={config.variant} className="gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

export function ReviewCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [cycle, setCycle] = useState<EquityReviewCycleWithStats | null>(null);
  const [vpStatuses, setVpStatuses] = useState<VpReviewStatusRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Action states
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  
  // PC workflow states
  const [isSubmittingToPc, setIsSubmittingToPc] = useState(false);
  const [showSubmitToPcDialog, setShowSubmitToPcDialog] = useState(false);
  const [pcSubmitNotes, setPcSubmitNotes] = useState('');
  const [isRecordingPcVote, setIsRecordingPcVote] = useState(false);
  const [showPcVoteDialog, setShowPcVoteDialog] = useState(false);
  const [pcVoteResult, setPcVoteResult] = useState<'approved' | 'rejected'>('approved');
  const [pcVoteNotes, setPcVoteNotes] = useState('');
  const [isRatifying, setIsRatifying] = useState(false);
  
  // Budget editing
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetValue, setBudgetValue] = useState('');
  
  // VP allocation editing
  const [editingVpAllocation, setEditingVpAllocation] = useState<string | null>(null);
  const [vpAllocationValue, setVpAllocationValue] = useState('');
  
  // Add new VP allocation
  const [showAddVpDialog, setShowAddVpDialog] = useState(false);
  const [newVpStem, setNewVpStem] = useState('');
  const [newVpAllocation, setNewVpAllocation] = useState('');

  // Allocation preview
  const [showAllocateDialog, setShowAllocateDialog] = useState(false);
  const [allocationPreview, setAllocationPreview] = useState<{
    allocations: Array<{
      vpStem: string;
      vpTitle: string | null;
      totalGap: number;
      gapPercentage: number;
      allocatedBudget: number;
      positionCount: number;
      underpaidCount: number;
      analyzedCount: number;
    }>;
    overallTotalGap: number;
    totalBudget: number;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  const loadData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewCyclesApi.get(parseInt(id));
      setCycle(data.cycle as EquityReviewCycleWithStats);
      setVpStatuses(data.vpStatuses);
      setBudgetValue(data.cycle.totalBudget?.toString() || '');
    } catch (err) {
      console.error('Failed to load review cycle:', err);
      setError('Failed to load review cycle');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleOpenAllocateDialog() {
    const budget = budgetValue ? parseFloat(budgetValue.replace(/[,$]/g, '')) : undefined;
    if (!budget || budget <= 0) {
      setError('Please enter a valid budget amount before previewing allocations');
      return;
    }
    
    setIsLoadingPreview(true);
    setShowAllocateDialog(true);
    setError(null);
    try {
      const preview = await reviewCyclesApi.previewAllocations(budget);
      setAllocationPreview(preview);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to preview allocations');
      setShowAllocateDialog(false);
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleConfirmAllocations() {
    if (!id || !cycle) return;
    
    const budget = budgetValue ? parseFloat(budgetValue.replace(/[,$]/g, '')) : undefined;
    if (!budget || budget <= 0) {
      setError('Please enter a valid budget amount');
      return;
    }
    
    setIsInitializing(true);
    setError(null);
    try {
      await reviewCyclesApi.initializeAllocations(parseInt(id), budget);
      setShowAllocateDialog(false);
      setAllocationPreview(null);
      await loadData();
    } catch (err) {
      console.error('Failed to initialize allocations:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize allocations');
    } finally {
      setIsInitializing(false);
    }
  }

  async function handleSendToVps() {
    if (!id) return;
    
    setIsSending(true);
    setError(null);
    try {
      await reviewCyclesApi.sendToVps(parseInt(id));
      await loadData();
    } catch (err) {
      console.error('Failed to send to VPs:', err);
      setError(err instanceof Error ? err.message : 'Failed to send to VPs');
    } finally {
      setIsSending(false);
    }
  }

  async function handleFinalize() {
    if (!id) return;
    
    setIsFinalizing(true);
    setError(null);
    try {
      await reviewCyclesApi.finalize(parseInt(id));
      setShowFinalizeDialog(false);
      await loadData();
    } catch (err) {
      console.error('Failed to finalize cycle:', err);
      setError(err instanceof Error ? err.message : 'Failed to finalize cycle');
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handleMarkImplemented() {
    if (!id) return;
    
    try {
      await reviewCyclesApi.markImplemented(parseInt(id));
      await loadData();
    } catch (err) {
      console.error('Failed to mark implemented:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark as implemented');
    }
  }

  async function handleArchive() {
    if (!id) return;
    
    try {
      await reviewCyclesApi.archive(parseInt(id));
      navigate('/review-cycles');
    } catch (err) {
      console.error('Failed to archive cycle:', err);
      setError(err instanceof Error ? err.message : 'Failed to archive cycle');
    }
  }

  async function handleDelete() {
    if (!id) return;
    
    if (!confirm('Are you sure you want to permanently delete this review cycle? This action cannot be undone.')) {
      return;
    }
    
    try {
      await reviewCyclesApi.delete(parseInt(id));
      navigate('/review-cycles');
    } catch (err) {
      console.error('Failed to delete cycle:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete cycle');
    }
  }

  async function handleMarkVpRevised(vpStem: string) {
    if (!id) return;
    
    try {
      await reviewCyclesApi.markVpRevised(parseInt(id), vpStem);
      await loadData();
    } catch (err) {
      console.error('Failed to mark as revised:', err);
    }
  }

  async function handleFinalizeVp(vpStem: string) {
    if (!id) return;
    
    try {
      await reviewCyclesApi.hrApproveVp(parseInt(id), vpStem);
      await loadData();
    } catch (err) {
      console.error('Failed to finalize VP review:', err);
      setError(err instanceof Error ? err.message : 'Failed to finalize VP review');
    }
  }

  async function handleFinalizeAllApprovedVps() {
    if (!id) return;
    
    const toFinalize = vpStatuses.filter(v => v.status === 'approved');
    if (toFinalize.length === 0) return;
    
    try {
      for (const vp of toFinalize) {
        await reviewCyclesApi.hrApproveVp(parseInt(id), vp.vpStem);
      }
      await loadData();
    } catch (err) {
      console.error('Failed to finalize VP reviews:', err);
      setError(err instanceof Error ? err.message : 'Failed to finalize VP reviews');
    }
  }

  async function handleUpdateVpAllocation(vpStem: string) {
    if (!id) return;
    
    const value = parseFloat(vpAllocationValue);
    if (isNaN(value) || value < 0) {
      setError('Please enter a valid allocation amount');
      return;
    }
    
    try {
      await reviewCyclesApi.updateVpAllocation(parseInt(id), vpStem, value);
      setEditingVpAllocation(null);
      setVpAllocationValue('');
      await loadData();
    } catch (err) {
      console.error('Failed to update VP allocation:', err);
      setError(err instanceof Error ? err.message : 'Failed to update allocation');
    }
  }

  async function handleAddVpAllocation() {
    if (!id || !newVpStem) return;
    
    const value = parseFloat(newVpAllocation);
    if (isNaN(value) || value < 0) {
      setError('Please enter a valid allocation amount');
      return;
    }
    
    try {
      await reviewCyclesApi.updateVpAllocation(parseInt(id), newVpStem, value);
      setShowAddVpDialog(false);
      setNewVpStem('');
      setNewVpAllocation('');
      await loadData();
    } catch (err) {
      console.error('Failed to add VP allocation:', err);
      setError(err instanceof Error ? err.message : 'Failed to add VP allocation');
    }
  }

  async function handleSubmitToPc() {
    if (!id) return;
    
    setIsSubmittingToPc(true);
    setError(null);
    try {
      await reviewCyclesApi.submitToPc(parseInt(id), pcSubmitNotes || undefined);
      setShowSubmitToPcDialog(false);
      setPcSubmitNotes('');
      await loadData();
    } catch (err) {
      console.error('Failed to submit to PC:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit to PC');
    } finally {
      setIsSubmittingToPc(false);
    }
  }

  async function handleRecordPcVote() {
    if (!id) return;
    
    setIsRecordingPcVote(true);
    setError(null);
    try {
      await reviewCyclesApi.recordPcVote(parseInt(id), pcVoteResult, undefined, pcVoteNotes || undefined);
      setShowPcVoteDialog(false);
      setPcVoteNotes('');
      await loadData();
    } catch (err) {
      console.error('Failed to record PC vote:', err);
      setError(err instanceof Error ? err.message : 'Failed to record PC vote');
    } finally {
      setIsRecordingPcVote(false);
    }
  }

  async function handleRatify() {
    if (!id) return;
    
    setIsRatifying(true);
    setError(null);
    try {
      await reviewCyclesApi.ratify(parseInt(id));
      await loadData();
    } catch (err) {
      console.error('Failed to ratify:', err);
      setError(err instanceof Error ? err.message : 'Failed to ratify plan');
    } finally {
      setIsRatifying(false);
    }
  }

  function handleDownloadReport() {
    if (!id) return;
    reviewCyclesApi.downloadPcReport(parseInt(id));
  }

  if (!isInstitutionWide) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Restricted</AlertTitle>
          <AlertDescription>
            Review cycle management is only available to HR administrators.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Not Found</AlertTitle>
        <AlertDescription>Review cycle not found.</AlertDescription>
      </Alert>
    );
  }

  const pendingVps = vpStatuses.filter(v => v.status === 'pending');
  const inReviewVps = vpStatuses.filter(v => v.status === 'in_review');
  const approvedVps = vpStatuses.filter(v => v.status === 'approved');
  const changesRequestedVps = vpStatuses.filter(v => v.status === 'changes_requested');
  const finalizedVps = vpStatuses.filter(v => v.status === 'finalized');

  const canInitialize = cycle.status === 'draft' || cycle.status === 'pending_vp_review';
  const canSendToVps = vpStatuses.length > 0 && pendingVps.length > 0;
  
  // All VPs must be in a resolved state (approved, finalized, or hr_revised) to finalize the cycle
  const allVpsResolved = vpStatuses.length > 0 && 
    changesRequestedVps.length === 0 && 
    inReviewVps.length === 0 && 
    pendingVps.length === 0;
  const canFinalize = cycle.status === 'hr_final_review' || 
    (cycle.status === 'vp_review_in_progress' && allVpsResolved);
  
  // PC workflow conditions
  const allVpsFinalized = vpStatuses.length > 0 && finalizedVps.length === vpStatuses.length;
  const canSubmitToPc = (cycle.status === 'hr_final_review' || cycle.status === 'vp_review_in_progress' || cycle.status === 'pc_rejected') && allVpsFinalized;
  const canRecordPcVote = cycle.status === 'pending_pc_approval';
  const canRatify = cycle.status === 'pc_approved';
  const totalProposed = vpStatuses.reduce((sum, vp) => sum + (vp.proposedTotal || 0), 0);
  const totalEmployees = vpStatuses.reduce((sum, vp) => sum + (vp.employeeCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/review-cycles')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{cycle.name}</h1>
              {getStatusBadge(cycle.status)}
            </div>
            <p className="text-muted-foreground">
              FY {cycle.fiscalYear} • Created by {cycle.createdByName} on {formatDate(cycle.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {cycle.status === 'approved' && (
            <Button onClick={handleMarkImplemented}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark Implemented
            </Button>
          )}
          {cycle.status === 'implemented' && (
            <Button variant="outline" onClick={handleArchive}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          )}
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Review Cycle Progress Stepper */}
      <Card>
        <CardContent className="pt-6 pb-4">
          <ReviewStepper
            currentStatus={cycle.status}
            vpApprovedCount={approvedVps.length + finalizedVps.length}
            vpTotalCount={vpStatuses.length}
          />
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Budget</span>
            </div>
            {editingBudget ? (
              <div className="flex gap-2">
                <Input
                  value={budgetValue}
                  onChange={(e) => setBudgetValue(e.target.value)}
                  placeholder="$100,000"
                  className="h-8"
                />
                <Button size="sm" onClick={() => setEditingBudget(false)}>Save</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{formatCurrency(cycle.totalBudget)}</span>
                {canInitialize && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingBudget(true)}>
                    Edit
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">VP Divisions</span>
            </div>
            <span className="text-2xl font-bold">{vpStatuses.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">VPs Finalized</span>
            </div>
            <span className="text-2xl font-bold text-green-600">
              {finalizedVps.length}/{vpStatuses.length}
            </span>
            {finalizedVps.length < vpStatuses.length && approvedVps.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                ({approvedVps.length} approved, awaiting HR)
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Deadline</span>
            </div>
            <span className="text-2xl font-bold">{formatDate(cycle.deadline)}</span>
          </CardContent>
        </Card>
      </div>

      {/* PC Status Card */}
      {(cycle.status === 'pending_pc_approval' || cycle.status === 'pc_approved' || cycle.status === 'pc_rejected' || cycle.pcVoteResult) && (
        <Card className={cycle.pcVoteResult === 'rejected' ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : cycle.pcVoteResult === 'approved' ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-purple-200 bg-purple-50 dark:bg-purple-950/20'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              President's Cabinet Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Submitted</div>
                <div className="font-medium">{formatDate(cycle.pcSubmittedAt)}</div>
              </div>
              {cycle.pcVoteResult && (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground">Vote Date</div>
                    <div className="font-medium">{formatDate(cycle.pcVoteDate)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Result</div>
                    <Badge variant={cycle.pcVoteResult === 'approved' ? 'default' : 'destructive'} className="mt-1">
                      {cycle.pcVoteResult === 'approved' ? (
                        <><CheckCircle className="h-3 w-3 mr-1" /> Approved</>
                      ) : (
                        <><XCircle className="h-3 w-3 mr-1" /> Rejected</>
                      )}
                    </Badge>
                  </div>
                </>
              )}
              {!cycle.pcVoteResult && (
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge variant="outline" className="mt-1">
                    <Clock className="h-3 w-3 mr-1" /> Awaiting Vote
                  </Badge>
                </div>
              )}
            </div>
            {cycle.pcVoteNotes && (
              <div className="pt-2 border-t">
                <div className="text-sm text-muted-foreground mb-1">PC Notes</div>
                <p className="text-sm">{cycle.pcVoteNotes}</p>
              </div>
            )}
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadReport}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" />
                Download PC Report (PDF)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {(canInitialize || canSendToVps || canFinalize || canSubmitToPc || canRecordPcVote || canRatify || approvedVps.length > 1 || allVpsFinalized) && (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Next steps for this review cycle</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {canInitialize && vpStatuses.length === 0 && (
              <Button onClick={handleOpenAllocateDialog} disabled={isInitializing || isLoadingPreview}>
                <Wand2 className="h-4 w-4 mr-2" />
                {isLoadingPreview ? 'Loading Preview...' : 'Initialize VP Allocations'}
              </Button>
            )}
            {canSendToVps && (
              <Button onClick={handleSendToVps} disabled={isSending}>
                <Send className="h-4 w-4 mr-2" />
                {isSending ? 'Sending...' : `Send to ${pendingVps.length} VP(s)`}
              </Button>
            )}
            {approvedVps.length > 1 && (
              <Button 
                onClick={handleFinalizeAllApprovedVps}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Finalize All {approvedVps.length} Approved VPs
              </Button>
            )}
            {canFinalize && !canSubmitToPc && (
              <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {cycle.status === 'hr_final_review' ? 'Approve Plan (Skip PC)' : 'Move to HR Final Review'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {cycle.status === 'hr_final_review' ? 'Approve Review Cycle' : 'Finalize VP Reviews'}
                    </DialogTitle>
                    <DialogDescription>
                      {cycle.status === 'hr_final_review' 
                        ? 'This will approve the plan directly without sending to President\'s Cabinet. All proposed raises will be locked.'
                        : 'This will move the cycle to HR Final Review. You can then submit to President\'s Cabinet or approve directly.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <div className="bg-muted rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VPs Finalized:</span>
                        <span className="font-medium">{finalizedVps.length}/{vpStatuses.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VPs Approved (pending HR):</span>
                        <span className="font-medium">{approvedVps.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Budget:</span>
                        <span className="font-medium">{formatCurrency(cycle.totalBudget)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Proposed:</span>
                        <span className="font-medium text-green-600">{formatCurrency(totalProposed)}</span>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowFinalizeDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleFinalize} 
                      disabled={isFinalizing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isFinalizing ? 'Processing...' : cycle.status === 'hr_final_review' ? 'Approve Plan' : 'Move to Final Review'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* Submit to President's Cabinet */}
            {canSubmitToPc && (
              <Dialog open={showSubmitToPcDialog} onOpenChange={setShowSubmitToPcDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    <Vote className="h-4 w-4 mr-2" />
                    Submit Equity Plan to PC
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Submit to President's Cabinet</DialogTitle>
                    <DialogDescription>
                      Submit this equity plan to President's Cabinet for approval vote.
                      All VP reviews have been finalized. You can download a comprehensive PDF report
                      to present to the Cabinet using the "Download PC Report" button.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="bg-muted rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VP Divisions:</span>
                        <span className="font-medium">{finalizedVps.length} finalized</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Proposed:</span>
                        <span className="font-medium text-green-600">{formatCurrency(totalProposed)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Employees Affected:</span>
                        <span className="font-medium">{totalEmployees}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Budget:</span>
                        <span className="font-medium">{formatCurrency(cycle.totalBudget)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pc-submit-notes">Notes for PC (optional)</Label>
                      <Textarea 
                        id="pc-submit-notes"
                        placeholder="Add any context or notes for the President's Cabinet..."
                        value={pcSubmitNotes}
                        onChange={(e) => setPcSubmitNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowSubmitToPcDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSubmitToPc} 
                      disabled={isSubmittingToPc}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {isSubmittingToPc ? 'Submitting...' : 'Submit to PC'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* Record PC Vote */}
            {canRecordPcVote && (
              <Dialog open={showPcVoteDialog} onOpenChange={setShowPcVoteDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    <Gavel className="h-4 w-4 mr-2" />
                    Record PC Vote
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record PC Vote</DialogTitle>
                    <DialogDescription>
                      Record the President's Cabinet vote on this equity plan.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="bg-muted rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Submitted:</span>
                        <span className="font-medium">{formatDate(cycle.pcSubmittedAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Proposed:</span>
                        <span className="font-medium text-green-600">{formatCurrency(totalProposed)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Vote Result</Label>
                      <div className="flex gap-4">
                        <Button 
                          variant={pcVoteResult === 'approved' ? 'default' : 'outline'}
                          className={pcVoteResult === 'approved' ? 'bg-green-600 hover:bg-green-700' : ''}
                          onClick={() => setPcVoteResult('approved')}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approved
                        </Button>
                        <Button 
                          variant={pcVoteResult === 'rejected' ? 'default' : 'outline'}
                          className={pcVoteResult === 'rejected' ? 'bg-red-600 hover:bg-red-700' : ''}
                          onClick={() => setPcVoteResult('rejected')}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Rejected
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pc-vote-notes">Vote Notes (optional)</Label>
                      <Textarea 
                        id="pc-vote-notes"
                        placeholder={pcVoteResult === 'rejected' 
                          ? "Describe what changes are needed..."
                          : "Add any notes about the vote..."}
                        value={pcVoteNotes}
                        onChange={(e) => setPcVoteNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowPcVoteDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleRecordPcVote} 
                      disabled={isRecordingPcVote}
                      className={pcVoteResult === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                    >
                      {isRecordingPcVote ? 'Recording...' : `Record ${pcVoteResult === 'approved' ? 'Approval' : 'Rejection'}`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* Ratify after PC approval */}
            {canRatify && (
              <Button 
                onClick={handleRatify} 
                disabled={isRatifying}
                className="bg-green-600 hover:bg-green-700"
              >
                <FileCheck className="h-4 w-4 mr-2" />
                {isRatifying ? 'Ratifying...' : 'Ratify & Finalize'}
              </Button>
            )}

            {/* Download PC Report (available once all VPs are finalized) */}
            {allVpsFinalized && (
              <Button
                variant="outline"
                onClick={handleDownloadReport}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" />
                Download PC Report (PDF)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* VP Status List */}
      <Card>
        <CardHeader>
          <CardTitle>VP Division Status</CardTitle>
          <CardDescription>
            Review status for each VP division
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {vpStatuses.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No VP allocations yet</p>
              <p className="text-sm">Click "Initialize VP Allocations" to set up the review</p>
            </div>
          ) : (
            <div className="divide-y">
              {vpStatuses.map(vp => (
                <div key={vp.id} className="p-4 hover:bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="font-medium">{vp.vpTitle || vp.vpStem}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          {vp.employeeCount} employees • 
                          {editingVpAllocation === vp.vpStem ? (
                            <span className="inline-flex items-center gap-1">
                              Allocated: $
                              <Input
                                type="number"
                                value={vpAllocationValue}
                                onChange={(e) => setVpAllocationValue(e.target.value)}
                                className="w-24 h-6 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateVpAllocation(vp.vpStem);
                                  if (e.key === 'Escape') {
                                    setEditingVpAllocation(null);
                                    setVpAllocationValue('');
                                  }
                                }}
                              />
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-6 w-6 p-0"
                                onClick={() => handleUpdateVpAllocation(vp.vpStem)}
                              >
                                <Check className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  setEditingVpAllocation(null);
                                  setVpAllocationValue('');
                                }}
                              >
                                <X className="h-3 w-3 text-red-600" />
                              </Button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              Allocated: {formatCurrency(vp.allocatedBudget)}
                              {['draft', 'pending_vp_review'].includes(cycle.status) && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-5 w-5 p-0"
                                  onClick={() => {
                                    setEditingVpAllocation(vp.vpStem);
                                    setVpAllocationValue(vp.allocatedBudget?.toString() || '0');
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </span>
                          )}
                          {vp.vpSupplementalOffer && vp.vpSupplementalOffer > 0 && (
                            <span className="ml-2 text-green-600 font-medium">
                              + {formatCurrency(vp.vpSupplementalOffer)} offered
                            </span>
                          )}
                        </div>
                        {vp.supplementalOfferNotes && (
                          <div className="text-xs text-green-600 mt-1 italic">
                            "{vp.supplementalOfferNotes}"
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {vp.status === 'changes_requested' && vp.notes && (
                        <div className="max-w-xs text-sm text-destructive truncate" title={vp.notes}>
                          "{vp.notes}"
                        </div>
                      )}
                      {getVpStatusBadge(vp.status)}
                      {vp.status === 'approved' && (
                        <Button 
                          size="sm" 
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleFinalizeVp(vp.vpStem)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Finalize
                        </Button>
                      )}
                      {vp.status === 'changes_requested' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleMarkVpRevised(vp.vpStem)}
                        >
                          Mark Revised
                        </Button>
                      )}
                      {vp.reviewedAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(vp.reviewedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cycle Notes */}
      {cycle.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{cycle.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Allocation Preview Dialog */}
      <Dialog open={showAllocateDialog} onOpenChange={setShowAllocateDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Budget Allocation Preview</DialogTitle>
            <DialogDescription>
              Review how the budget will be distributed across VP divisions before confirming.
            </DialogDescription>
          </DialogHeader>

          {/* Methodology explanation */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">How allocation works</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              The budget is distributed <strong>proportionally based on each division's total equity gap</strong> — 
              the sum of how much each underpaid employee falls below their CUPA median salary. 
              Divisions with larger gaps receive a larger share of the budget. Divisions where all 
              employees are at or above their CUPA median receive $0.
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              You can manually adjust individual VP allocations after initialization.
            </p>
          </div>

          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : allocationPreview ? (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-xs text-muted-foreground">Total Budget</div>
                  <div className="text-lg font-bold">{formatCurrency(allocationPreview.totalBudget)}</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-xs text-muted-foreground">Total Equity Gap</div>
                  <div className="text-lg font-bold text-red-600">{formatCurrency(allocationPreview.overallTotalGap)}</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-xs text-muted-foreground">Budget / Gap</div>
                  <div className="text-lg font-bold">
                    {allocationPreview.overallTotalGap > 0 
                      ? `${((allocationPreview.totalBudget / allocationPreview.overallTotalGap) * 100).toFixed(1)}%`
                      : 'N/A'
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">coverage</div>
                </div>
              </div>

              {/* Allocation table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">VP Division</th>
                      <th className="text-right p-3 font-medium">Positions</th>
                      <th className="text-right p-3 font-medium">Underpaid</th>
                      <th className="text-right p-3 font-medium">Total Gap</th>
                      <th className="text-right p-3 font-medium">Share</th>
                      <th className="text-right p-3 font-medium">Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationPreview.allocations.map(a => (
                      <tr key={a.vpStem} className="border-t hover:bg-muted/30">
                        <td className="p-3">
                          <div className="font-medium">{a.vpTitle || a.vpStem}</div>
                          <div className="text-xs text-muted-foreground">{a.vpStem}</div>
                        </td>
                        <td className="p-3 text-right tabular-nums">{a.positionCount}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={a.underpaidCount > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                            {a.underpaidCount}
                          </span>
                          <span className="text-muted-foreground text-xs ml-1">/ {a.analyzedCount}</span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={a.totalGap > 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(a.totalGap)}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {a.gapPercentage > 0 ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 rounded-full" 
                                  style={{ width: `${Math.min(100, a.gapPercentage)}%` }}
                                />
                              </div>
                              <span className="text-xs w-10 text-right">{a.gapPercentage.toFixed(1)}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">0%</span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">
                          {formatCurrency(a.allocatedBudget)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 bg-muted/30 font-semibold">
                    <tr>
                      <td className="p-3">Totals</td>
                      <td className="p-3 text-right tabular-nums">
                        {allocationPreview.allocations.reduce((s, a) => s + a.positionCount, 0)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-red-600">
                        {allocationPreview.allocations.reduce((s, a) => s + a.underpaidCount, 0)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-red-600">
                        {formatCurrency(allocationPreview.overallTotalGap)}
                      </td>
                      <td className="p-3 text-right tabular-nums">100%</td>
                      <td className="p-3 text-right tabular-nums">
                        {formatCurrency(allocationPreview.totalBudget)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAllocateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmAllocations} 
              disabled={isInitializing || !allocationPreview}
              className="bg-green-600 hover:bg-green-700"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              {isInitializing ? 'Initializing...' : 'Confirm & Initialize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
