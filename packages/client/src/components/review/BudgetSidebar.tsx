import { useState } from 'react';
import { Calculator, Wand2, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck } from 'lucide-react';
import type { EmployeeFeedbackType } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

interface BudgetSidebarProps {
  cycleName: string;
  allocatedBudget: number;
  totalProposed: number;
  positionCount: number;
  reviewedCount: number;
  deadline: string | null;
  vpSupplementalFunding: string;
  onVpSupplementalFundingChange: (value: string) => void;
  supplementalOfferNotes: string;
  onSupplementalOfferNotesChange: (value: string) => void;
  existingSupplementalOffer: number | null;
  onAutoAllocate: () => void;
  onClearRaises: () => void;
  isAutoAllocating: boolean;
  isClearingRaises: boolean;
  lastAllocation: { budget: number; allocated: number; positions: number } | null;
}

export function BudgetSidebar({
  cycleName,
  allocatedBudget,
  totalProposed,
  positionCount,
  reviewedCount,
  deadline,
  vpSupplementalFunding,
  onVpSupplementalFundingChange,
  supplementalOfferNotes,
  onSupplementalOfferNotesChange,
  existingSupplementalOffer,
  onAutoAllocate,
  onClearRaises,
  isAutoAllocating,
  isClearingRaises,
  lastAllocation,
}: BudgetSidebarProps) {
  const supplemental = parseFloat(vpSupplementalFunding.replace(/[,$]/g, '')) || 0;
  const totalBudget = allocatedBudget + supplemental;
  const remaining = totalBudget - totalProposed;
  const isOverBudget = remaining < 0;
  // How much proposed raises exceed the HR-allocated budget (before supplemental)
  const overageAmount = Math.max(0, totalProposed - allocatedBudget);

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Your Review</CardTitle>
        </div>
        <CardDescription>{cycleName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* HR Allocated Budget */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <div className="text-sm text-muted-foreground">HR Allocated Budget</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(allocatedBudget)}
          </div>
        </div>

        {/* Additional Funding Required */}
        <div className={`p-3 rounded-lg border-2 ${
          overageAmount > 0 
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700' 
            : 'bg-purple-50 dark:bg-purple-950/30 border-dashed border-purple-200 dark:border-purple-800'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Calculator className={`h-4 w-4 ${overageAmount > 0 ? 'text-amber-600' : 'text-purple-600'}`} />
            <span className={`text-sm font-medium ${overageAmount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-purple-700 dark:text-purple-300'}`}>
              Additional Funding Required
            </span>
          </div>
          <Input
            type="text"
            placeholder="$0"
            value={vpSupplementalFunding}
            onChange={(e) => onVpSupplementalFundingChange(e.target.value)}
            className="font-mono bg-white dark:bg-gray-900"
          />
          {supplemental > 0 && (
            <>
              <Textarea
                placeholder="Explain where this funding is coming from (required)..."
                value={supplementalOfferNotes}
                onChange={(e) => onSupplementalOfferNotesChange(e.target.value)}
                className={`mt-2 text-sm ${!supplementalOfferNotes.trim() ? 'border-red-300 dark:border-red-700' : ''}`}
                rows={2}
              />
              {!supplementalOfferNotes.trim() && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  A note explaining the funding source is required
                </p>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            {overageAmount > 0 && supplemental === 0
              ? `Your proposed raises exceed the HR budget by ${formatCurrency(overageAmount)}. Enter the additional amount and explain where the funding is coming from.`
              : supplemental > 0
                ? `This ${formatCurrency(supplemental)} will be included when you approve the review`
                : 'If your proposed raises exceed the HR-allocated budget, enter additional funding from your department here'}
          </p>
        </div>

        {/* Combined Total */}
        {supplemental > 0 && (
          <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
            <div className="text-sm text-muted-foreground">Combined Total Budget</div>
            <div className="text-xl font-bold text-green-600">
              {formatCurrency(totalBudget)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(allocatedBudget)} HR + {formatCurrency(supplemental)} yours
              {existingSupplementalOffer ? ' (offered)' : ''}
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
              onClick={onAutoAllocate}
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
              onClick={onClearRaises}
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
              Allocated {formatCurrency(lastAllocation.allocated)} to{' '}
              {lastAllocation.positions} employees
            </div>
          )}
        </div>

        {/* Proposed Total */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Proposed Raises</span>
            <span className="font-mono font-medium">{formatCurrency(totalProposed)}</span>
          </div>

          <div
            className={`p-3 rounded-lg ${isOverBudget ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}
          >
            <div className="flex justify-between text-sm">
              <span className={isOverBudget ? 'text-red-600' : 'text-green-600'}>
                {isOverBudget ? 'Over Budget' : 'Remaining'}
              </span>
              <span
                className={`font-mono font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}
              >
                {isOverBudget ? '+' : ''}
                {formatCurrency(Math.abs(remaining))}
              </span>
            </div>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}
                style={{
                  width: `${Math.min(100, totalBudget > 0 ? (totalProposed / totalBudget) * 100 : 0)}%`,
                }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground text-right">
              {totalBudget > 0 ? ((totalProposed / totalBudget) * 100).toFixed(0) : 0}% of budget
            </div>
          </div>
        </div>

        {/* Review Progress */}
        <div className="pt-3 border-t">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Review Progress</span>
            <span className="font-medium">
              {reviewedCount} / {positionCount}
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${positionCount > 0 ? (reviewedCount / positionCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Deadline */}
        {deadline && (
          <div className="pt-3 border-t text-sm">
            <span className="text-muted-foreground">Due: </span>
            <span className="font-medium">
              {new Date(deadline).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
