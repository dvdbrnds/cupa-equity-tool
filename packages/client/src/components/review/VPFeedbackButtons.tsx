import {
  ThumbsUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  MessageSquare,
  Loader2,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { EmployeeFeedbackType } from '@cupa/shared';

interface FeedbackOption {
  type: EmployeeFeedbackType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeColor: string;
  expandable: boolean;
}

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  {
    type: 'approve',
    label: 'Approve',
    icon: ThumbsUp,
    color: 'text-green-600 hover:bg-green-50 hover:text-green-700 border-green-200',
    activeColor: 'bg-green-600 text-white hover:bg-green-700 border-green-600',
    expandable: false,
  },
  {
    type: 'increase',
    label: 'Increase',
    icon: ArrowUpRight,
    color: 'text-blue-600 hover:bg-blue-50 hover:text-blue-700 border-blue-200',
    activeColor: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
    expandable: true,
  },
  {
    type: 'decrease',
    label: 'Decrease',
    icon: ArrowDownRight,
    color: 'text-orange-600 hover:bg-orange-50 hover:text-orange-700 border-orange-200',
    activeColor: 'bg-orange-600 text-white hover:bg-orange-700 border-orange-600',
    expandable: true,
  },
  {
    type: 'defer',
    label: 'Defer',
    icon: Clock,
    color: 'text-gray-600 hover:bg-gray-50 hover:text-gray-700 border-gray-200',
    activeColor: 'bg-gray-600 text-white hover:bg-gray-700 border-gray-600',
    expandable: false,
  },
  {
    type: 'discuss',
    label: 'Discuss',
    icon: MessageSquare,
    color: 'text-purple-600 hover:bg-purple-50 hover:text-purple-700 border-purple-200',
    activeColor: 'bg-purple-600 text-white hover:bg-purple-700 border-purple-600',
    expandable: true,
  },
];

interface ExpandedFormProps {
  notes: string;
  onNotesChange: (value: string) => void;
  adjustedRaise: string;
  onAdjustedRaiseChange: (value: string) => void;
  proposedRaise: number | null | undefined;
}

interface VPFeedbackButtonsProps {
  currentFeedback: EmployeeFeedbackType | undefined;
  isSaving: boolean;
  isExpanded: boolean;
  onQuickFeedback: (type: EmployeeFeedbackType) => void;
  onToggleExpand: () => void;
  onSaveFeedback: (type: EmployeeFeedbackType) => void;
  expandedForm: ExpandedFormProps;
}

export function VPFeedbackButtons({
  currentFeedback,
  isSaving,
  isExpanded,
  onQuickFeedback,
  onToggleExpand,
  onSaveFeedback,
  expandedForm,
}: VPFeedbackButtonsProps) {
  const activeOption = FEEDBACK_OPTIONS.find((o) => o.type === currentFeedback);

  function handleClick(option: FeedbackOption) {
    if (isSaving) return;

    if (option.expandable) {
      // Expandable types: toggle the form open
      if (isExpanded && currentFeedback === option.type) {
        // Already expanded with this type, close it
        onToggleExpand();
      } else {
        // Select the type and expand
        onQuickFeedback(option.type);
        if (!isExpanded) {
          onToggleExpand();
        }
      }
    } else {
      // Non-expandable (approve, defer): just set and save immediately
      onQuickFeedback(option.type);
    }
  }

  return (
    <div className="space-y-2">
      {/* Feedback buttons row */}
      <div className="flex items-center gap-1">
        {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-1" />}
        {FEEDBACK_OPTIONS.map((option) => {
          const isActive = currentFeedback === option.type;
          return (
            <button
              key={option.type}
              onClick={() => handleClick(option)}
              disabled={isSaving}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all',
                isActive ? option.activeColor : option.color,
                isSaving && 'opacity-50 cursor-not-allowed'
              )}
            >
              <option.icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/* Expanded Form */}
      {isExpanded && activeOption?.expandable && (
        <div className="ml-1 p-3 bg-muted/50 rounded-lg border space-y-2 animate-in slide-in-from-top-1 duration-200">
          {(currentFeedback === 'increase' || currentFeedback === 'decrease') && (
            <div>
              <Label className="text-xs">Adjusted Raise Amount</Label>
              <Input
                type="text"
                placeholder={
                  expandedForm.proposedRaise
                    ? `Current: $${expandedForm.proposedRaise}`
                    : '$0'
                }
                value={expandedForm.adjustedRaise}
                onChange={(e) => expandedForm.onAdjustedRaiseChange(e.target.value)}
                className="h-7 text-xs font-mono"
              />
            </div>
          )}
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              placeholder={
                currentFeedback === 'discuss'
                  ? 'What would you like to discuss?'
                  : 'Optional notes...'
              }
              value={expandedForm.notes}
              onChange={(e) => expandedForm.onNotesChange(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => onSaveFeedback(currentFeedback!)}
              disabled={isSaving}
              className="h-7 text-xs"
            >
              <Send className="h-3 w-3 mr-1" />
              Save Feedback
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
