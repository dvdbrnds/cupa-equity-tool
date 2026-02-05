import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Calendar, 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ChevronRight,
  Archive,
  CheckCircle,
  Settings2,
  Building2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { reviewCyclesApi, equityAnalysisApi } from '@/services/api';
import type { EquityReviewCycleWithStats, ReviewCycleStatus } from '@cupa/shared';
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
  const variants: Record<ReviewCycleStatus, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string; icon: React.ReactNode }> = {
    draft: { variant: 'secondary', label: 'Draft', icon: <Settings2 className="h-3 w-3" /> },
    calculating: { variant: 'secondary', label: 'Calculating', icon: <Clock className="h-3 w-3 animate-spin" /> },
    pending_vp_review: { variant: 'outline', label: 'Pending VP Review', icon: <Clock className="h-3 w-3" /> },
    vp_review_in_progress: { variant: 'default', label: 'VP Review In Progress', icon: <Users className="h-3 w-3" /> },
    hr_final_review: { variant: 'default', label: 'HR Final Review', icon: <AlertCircle className="h-3 w-3" /> },
    approved: { variant: 'default', label: 'Approved', icon: <CheckCircle2 className="h-3 w-3" /> },
    implemented: { variant: 'default', label: 'Implemented', icon: <CheckCircle className="h-3 w-3" /> },
    archived: { variant: 'secondary', label: 'Archived', icon: <Archive className="h-3 w-3" /> },
  };
  
  const config = variants[status] || variants.draft;
  return (
    <Badge variant={config.variant} className="gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

export function ReviewCyclesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [cycles, setCycles] = useState<EquityReviewCycleWithStats[]>([]);
  const [salaryYears, setSalaryYears] = useState<Array<{ data_year: string; count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create cycle dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCycle, setNewCycle] = useState({
    name: '',
    fiscalYear: new Date().getFullYear().toString(),
    totalBudget: '',
    cupaDataYear: '',
    deadline: '',
    notes: '',
  });

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [cyclesData, yearsData] = await Promise.all([
        reviewCyclesApi.list(),
        equityAnalysisApi.getSalaryDataYears(),
      ]);
      setCycles(cyclesData);
      setSalaryYears(yearsData);
      
      // Pre-fill CUPA data year with most recent
      if (yearsData.length > 0 && !newCycle.cupaDataYear && yearsData[0]) {
        setNewCycle(prev => ({ ...prev, cupaDataYear: yearsData[0]?.data_year || '' }));
      }
    } catch (err) {
      console.error('Failed to load review cycles:', err);
      setError('Failed to load review cycles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateCycle() {
    if (!newCycle.name || !newCycle.fiscalYear) return;
    
    setIsCreating(true);
    try {
      const result = await reviewCyclesApi.create({
        name: newCycle.name,
        fiscalYear: newCycle.fiscalYear,
        totalBudget: newCycle.totalBudget ? parseFloat(newCycle.totalBudget.replace(/[,$]/g, '')) : undefined,
        cupaDataYear: newCycle.cupaDataYear || undefined,
        deadline: newCycle.deadline || undefined,
        notes: newCycle.notes || undefined,
      });
      
      setShowCreateDialog(false);
      setNewCycle({
        name: '',
        fiscalYear: new Date().getFullYear().toString(),
        totalBudget: '',
        cupaDataYear: salaryYears[0]?.data_year || '',
        deadline: '',
        notes: '',
      });
      
      // Navigate to the new cycle detail page
      navigate(`/review-cycles/${result.id}`);
    } catch (err) {
      console.error('Failed to create cycle:', err);
      setError(err instanceof Error ? err.message : 'Failed to create review cycle');
    } finally {
      setIsCreating(false);
    }
  }

  if (!isInstitutionWide) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Restricted</AlertTitle>
          <AlertDescription>
            Review cycle management is only available to HR administrators.
            If you're looking for your pending reviews, check the Dashboard.
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

  const activeCycles = cycles.filter(c => !['archived', 'implemented'].includes(c.status));
  const completedCycles = cycles.filter(c => ['archived', 'implemented'].includes(c.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equity Review Cycles</h1>
          <p className="text-muted-foreground">
            Manage formal equity review workflows with VP approval tracking
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Review Cycle
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Equity Review Cycle</DialogTitle>
              <DialogDescription>
                Start a new equity review cycle. You'll be able to configure allocations and send to VPs after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Cycle Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., FY2026 Annual Equity Review"
                  value={newCycle.name}
                  onChange={(e) => setNewCycle(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fiscalYear">Fiscal Year</Label>
                  <Input
                    id="fiscalYear"
                    placeholder="2026"
                    value={newCycle.fiscalYear}
                    onChange={(e) => setNewCycle(prev => ({ ...prev, fiscalYear: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cupaDataYear">CUPA Data Year</Label>
                  <Select 
                    value={newCycle.cupaDataYear} 
                    onValueChange={(v) => setNewCycle(prev => ({ ...prev, cupaDataYear: v }))}
                  >
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
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalBudget">Total Equity Budget</Label>
                  <Input
                    id="totalBudget"
                    placeholder="$100,000"
                    value={newCycle.totalBudget}
                    onChange={(e) => setNewCycle(prev => ({ ...prev, totalBudget: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">VP Review Deadline</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={newCycle.deadline}
                    onChange={(e) => setNewCycle(prev => ({ ...prev, deadline: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any notes about this review cycle..."
                  value={newCycle.notes}
                  onChange={(e) => setNewCycle(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCycle} disabled={isCreating || !newCycle.name}>
                {isCreating ? 'Creating...' : 'Create Cycle'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Active Cycles */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Active Cycles</h2>
        {activeCycles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No active review cycles</p>
              <p className="text-muted-foreground mb-4">
                Create a new review cycle to begin the equity review process
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Review Cycle
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {activeCycles.map(cycle => (
              <Card 
                key={cycle.id} 
                className="hover:border-primary/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/review-cycles/${cycle.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{cycle.name}</h3>
                        {getStatusBadge(cycle.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          FY {cycle.fiscalYear}
                        </span>
                        {cycle.deadline && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Due: {formatDate(cycle.deadline)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          {cycle.vpCount} VP divisions
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-lg font-semibold">{formatCurrency(cycle.totalBudget)}</div>
                        <p className="text-xs text-muted-foreground">Total Budget</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-green-600">
                          {cycle.approvedVpCount}/{cycle.vpCount}
                        </div>
                        <p className="text-xs text-muted-foreground">VPs Approved</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  
                  {/* VP Progress Bar */}
                  {cycle.vpCount > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">VP Review Progress</span>
                        <span className="font-medium">
                          {Math.round((cycle.approvedVpCount / cycle.vpCount) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${(cycle.approvedVpCount / cycle.vpCount) * 100}%` }}
                        />
                      </div>
                      {cycle.pendingVpCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {cycle.pendingVpCount} VP{cycle.pendingVpCount !== 1 ? 's' : ''} still pending review
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Cycles */}
      {completedCycles.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Completed Cycles</h2>
          <div className="space-y-2">
            {completedCycles.map(cycle => (
              <Card 
                key={cycle.id} 
                className="hover:border-primary/50 cursor-pointer transition-colors opacity-75"
                onClick={() => navigate(`/review-cycles/${cycle.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">{cycle.name}</h3>
                      {getStatusBadge(cycle.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>FY {cycle.fiscalYear}</span>
                      <span>{formatCurrency(cycle.totalBudget)} budget</span>
                      <span>{cycle.vpCount} VPs</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
