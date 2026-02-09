import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { EquityReviewCycleWithStats } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

interface CycleStatusBannerProps {
  cycle: EquityReviewCycleWithStats;
}

const STEP_ORDER = [
  'draft',
  'pending_vp_review',
  'vp_review_in_progress',
  'hr_final_review',
  'pending_pc_approval',
  'pc_approved',
  'approved',
  'implemented',
] as const;

const STEP_LABELS: Record<string, string> = {
  draft: 'Draft',
  calculating: 'Calculating',
  pending_vp_review: 'VP Review',
  vp_review_in_progress: 'VP Review',
  hr_final_review: 'HR Review',
  pending_pc_approval: 'PC Vote',
  pc_approved: 'PC Approved',
  pc_rejected: 'PC Rejected',
  approved: 'Approved',
  implemented: 'Implemented',
  archived: 'Archived',
};

// Collapsed steps for the banner stepper
const STEPPER_STEPS = [
  { key: 'draft', label: 'Draft', statuses: ['draft', 'calculating'] },
  {
    key: 'vp_review',
    label: 'VP Review',
    statuses: ['pending_vp_review', 'vp_review_in_progress'],
  },
  { key: 'hr_review', label: 'HR Review', statuses: ['hr_final_review'] },
  { key: 'pc_vote', label: 'PC Vote', statuses: ['pending_pc_approval', 'pc_approved', 'pc_rejected'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'implemented', label: 'Implemented', statuses: ['implemented'] },
];

export function CycleStatusBanner({ cycle }: CycleStatusBannerProps) {
  const navigate = useNavigate();

  // Determine which stepper step is active
  const activeStepIndex = STEPPER_STEPS.findIndex((step) =>
    step.statuses.includes(cycle.status)
  );

  return (
    <Alert
      className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
      onClick={() => navigate(`/review-cycles/${cycle.id}`)}
    >
      <AlertTitle className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-blue-900 dark:text-blue-100 font-semibold">{cycle.name}</span>
          <Badge variant="outline" className="text-xs">
            {STEP_LABELS[cycle.status] || cycle.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{formatCurrency(cycle.totalBudget)} budget</span>
          <span>
            {cycle.approvedVpCount}/{cycle.vpCount} VPs
          </span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </AlertTitle>
      <AlertDescription>
        {/* Mini stepper */}
        <div className="flex items-center gap-1 mt-3">
          {STEPPER_STEPS.map((step, i) => {
            const isCompleted = i < activeStepIndex;
            const isActive = i === activeStepIndex;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`h-1.5 w-full rounded-full transition-colors ${
                      isCompleted
                        ? 'bg-blue-500'
                        : isActive
                          ? 'bg-blue-400'
                          : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                  <span
                    className={`text-[10px] mt-1 ${
                      isActive
                        ? 'text-blue-600 font-semibold'
                        : isCompleted
                          ? 'text-blue-500'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </AlertDescription>
    </Alert>
  );
}
