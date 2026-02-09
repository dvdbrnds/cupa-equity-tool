import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepperStep {
  key: string;
  label: string;
  statuses: string[];
  detail?: string;
}

const DEFAULT_STEPS: StepperStep[] = [
  { key: 'draft', label: 'Draft', statuses: ['draft', 'calculating'] },
  {
    key: 'vp_review',
    label: 'VP Review',
    statuses: ['pending_vp_review', 'vp_review_in_progress'],
  },
  { key: 'hr_review', label: 'HR Review', statuses: ['hr_final_review'] },
  {
    key: 'pc_vote',
    label: 'PC Vote',
    statuses: ['pending_pc_approval', 'pc_approved', 'pc_rejected'],
  },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'implemented', label: 'Implemented', statuses: ['implemented'] },
];

interface ReviewStepperProps {
  currentStatus: string;
  steps?: StepperStep[];
  vpApprovedCount?: number;
  vpTotalCount?: number;
  compact?: boolean;
}

export function ReviewStepper({
  currentStatus,
  steps = DEFAULT_STEPS,
  vpApprovedCount,
  vpTotalCount,
  compact = false,
}: ReviewStepperProps) {
  const activeStepIndex = steps.findIndex((step) =>
    step.statuses.includes(currentStatus)
  );

  // Handle archived status -- show all completed
  const isArchived = currentStatus === 'archived';
  const isRejected = currentStatus === 'pc_rejected';

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isReachedCompact = step.statuses.includes('implemented') || step.statuses.includes('approved');
          const isCompleted = isArchived || i < activeStepIndex || (isReachedCompact && i === activeStepIndex);
          const isActive = !isArchived && !isCompleted && i === activeStepIndex;
          return (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    'h-1.5 w-full rounded-full transition-colors',
                    isCompleted
                      ? 'bg-blue-500'
                      : isActive
                        ? isRejected && step.key === 'pc_vote'
                          ? 'bg-red-400'
                          : 'bg-blue-400'
                        : 'bg-gray-200 dark:bg-gray-700'
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] mt-1',
                    isActive
                      ? isRejected && step.key === 'pc_vote'
                        ? 'text-red-600 font-semibold'
                        : 'text-blue-600 font-semibold'
                      : isCompleted
                        ? 'text-blue-500'
                        : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center">
        {steps.map((step, i) => {
          // For reached milestones (approved, implemented), show as completed since they represent achieved states
          const isReachedMilestone = step.statuses.includes('implemented') || step.statuses.includes('approved');
          const isCompleted = isArchived || i < activeStepIndex || (isReachedMilestone && i === activeStepIndex);
          const isActive = !isArchived && !isCompleted && i === activeStepIndex;

          return (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1 relative">
                {/* Connector line */}
                {i > 0 && (
                  <div
                    className={cn(
                      'absolute top-4 right-1/2 w-full h-0.5',
                      isCompleted || (i === activeStepIndex) ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  />
                )}

                {/* Circle */}
                <div
                  className={cn(
                    'relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
                    isCompleted
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : isActive
                        ? isRejected && step.key === 'pc_vote'
                          ? 'bg-red-50 border-red-500 text-red-600'
                          : 'bg-blue-50 border-blue-500 text-blue-600'
                        : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-400'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold">{i + 1}</span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'mt-2 text-xs font-medium text-center',
                    isActive
                      ? isRejected && step.key === 'pc_vote'
                        ? 'text-red-600 font-semibold'
                        : 'text-blue-600 font-semibold'
                      : isCompleted
                        ? 'text-blue-600'
                        : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                  {isRejected && step.key === 'pc_vote' && (
                    <span className="block text-red-500 text-[10px]">Rejected</span>
                  )}
                </span>

                {/* Contextual stats */}
                {isActive &&
                  step.key === 'vp_review' &&
                  vpApprovedCount !== undefined &&
                  vpTotalCount !== undefined && (
                    <span className="text-[10px] text-blue-500 mt-0.5">
                      {vpApprovedCount}/{vpTotalCount} VPs
                    </span>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
