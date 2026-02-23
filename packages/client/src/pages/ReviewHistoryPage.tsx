import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  CheckCircle2, 
  Archive,
  ChevronRight,
  Building2,
  Users,
  DollarSign,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/context/AuthContext';
import { reviewCyclesApi } from '@/services/api';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';
import type { EquityReviewCycleWithStats, ReviewCycleStatus } from '@cupa/shared';

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
    draft: { variant: 'secondary', label: 'Draft', icon: null },
    calculating: { variant: 'secondary', label: 'Calculating', icon: null },
    pending_vp_review: { variant: 'outline', label: 'Pending VP Review', icon: null },
    vp_review_in_progress: { variant: 'default', label: 'VP Review In Progress', icon: null },
    hr_final_review: { variant: 'default', label: 'HR Final Review', icon: null },
    pending_pc_approval: { variant: 'outline', label: 'Pending PC Vote', icon: <Clock className="h-3 w-3" /> },
    pc_approved: { variant: 'default', label: 'PC Approved', icon: <CheckCircle2 className="h-3 w-3" /> },
    pc_rejected: { variant: 'destructive', label: 'PC Rejected', icon: null },
    approved: { variant: 'default', label: 'Approved', icon: <CheckCircle2 className="h-3 w-3" /> },
    implemented: { variant: 'default', label: 'Implemented', icon: <CheckCircle2 className="h-3 w-3" /> },
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

export function ReviewHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [cycles, setCycles] = useState<EquityReviewCycleWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Load completed review cycles (implemented or archived)
      const allCycles = await reviewCyclesApi.list({ includeArchived: true });
      
      // Filter to completed cycles only
      const completedStatuses: ReviewCycleStatus[] = ['implemented', 'archived', 'approved', 'pc_approved'];
      const completed = allCycles.filter(cycle => completedStatuses.includes(cycle.status));
      
      // For VPs, filter to cycles they participated in
      if (!isInstitutionWide && user?.division) {
        // VP can see cycles where they have a review status record
        const vpCycles = await Promise.all(
          completed.map(async (cycle) => {
            try {
              const { vpStatuses } = await reviewCyclesApi.get(cycle.id);
              const hasParticipated = vpStatuses.some(vp => vp.vpStem === user.division);
              return hasParticipated ? cycle : null;
            } catch {
              return null;
            }
          })
        );
        setCycles(vpCycles.filter((c): c is EquityReviewCycleWithStats => c !== null));
      } else {
        // HR sees all completed cycles
        setCycles(completed);
      }
    } catch (err) {
      console.error('Failed to load review history:', err);
      setError('Failed to load review history data');
    } finally {
      setIsLoading(false);
    }
  }, [isInstitutionWide, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review History</h1>
        <p className="text-muted-foreground mt-2">
          {isInstitutionWide 
            ? 'View all completed equity review cycles across the institution'
            : 'View your completed equity review cycles'}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {cycles.length === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Completed Review Cycles</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {isInstitutionWide 
                ? 'Completed review cycles will appear here once they are marked as implemented or archived.'
                : 'Your completed review cycles will appear here once they are marked as implemented or archived.'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {cycles.map((cycle) => (
          <Card key={cycle.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl">{cycle.name}</CardTitle>
                  <CardDescription>
                    Fiscal Year {cycle.fiscalYear}
                    {cycle.cupaDataYear && ` • CUPA Data: ${cycle.cupaDataYear}`}
                  </CardDescription>
                </div>
                {getStatusBadge(cycle.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{formatDate(cycle.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">Total Budget</p>
                    <p className="font-medium">{formatCurrency(cycle.totalBudget)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">Total Proposed</p>
                    <p className="font-medium">{formatCurrency(cycle.totalProposed)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">VP Divisions</p>
                    <p className="font-medium">{cycle.vpCount} divisions</p>
                  </div>
                </div>
              </div>

              {cycle.notes && (
                <div className="text-sm text-muted-foreground bg-muted rounded-md p-3 mb-4">
                  <p className="font-medium mb-1">Notes:</p>
                  <p>{cycle.notes}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/review-cycles/${cycle.id}`)}
                >
                  View Details
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {cycles.length > 0 && (
        <div className="text-center text-sm text-muted-foreground pt-4 border-t">
          Showing {cycles.length} completed review cycle{cycles.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
