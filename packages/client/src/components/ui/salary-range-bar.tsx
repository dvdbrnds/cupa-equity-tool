import { cn } from '@/lib/utils';

interface SalaryRangeBarProps {
  currentSalary: number | null;
  adjustedMedian: number | null;
  baseMedian?: number | null;
  className?: string;
  showLabels?: boolean;
}

/**
 * Visual salary range bar showing:
 * - The range from 50% to 150% of adjusted median
 * - A marker at the median (100%)
 * - A marker for the current salary position
 * - Color coding based on position relative to median
 */
export function SalaryRangeBar({ 
  currentSalary, 
  adjustedMedian, 
  baseMedian,
  className,
  showLabels = false 
}: SalaryRangeBarProps) {
  if (!currentSalary || !adjustedMedian) {
    return (
      <div className={cn("h-6 bg-muted rounded flex items-center justify-center", className)}>
        <span className="text-xs text-muted-foreground">No data</span>
      </div>
    );
  }

  // Calculate position as percentage of median (100% = at median)
  const percentOfMedian = (currentSalary / adjustedMedian) * 100;
  
  // Range is 50% to 150% of median - map to 0-100% for the bar
  const minRange = 50;
  const maxRange = 150;
  const rangeSpan = maxRange - minRange; // 100
  
  // Calculate position on the bar (0% = 50% of median, 100% = 150% of median)
  const barPosition = Math.max(0, Math.min(100, ((percentOfMedian - minRange) / rangeSpan) * 100));
  
  // Determine color based on position
  const isUnderpaid = percentOfMedian < 95;
  const isOverpaid = percentOfMedian > 105;
  const isAtMedian = !isUnderpaid && !isOverpaid;

  const markerColor = isUnderpaid 
    ? 'bg-red-500' 
    : isOverpaid 
      ? 'bg-green-500' 
      : 'bg-blue-500';

  const fillColor = isUnderpaid
    ? 'bg-red-200'
    : isOverpaid
      ? 'bg-green-200'
      : 'bg-blue-200';

  // Format currency for tooltips
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const low = adjustedMedian * 0.5;
  const high = adjustedMedian * 1.5;

  return (
    <div className={cn("space-y-1", className)}>
      {/* Labels row */}
      {showLabels && (
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
          <span>{formatCurrency(low)}</span>
          <span className="font-medium">{formatCurrency(adjustedMedian)}</span>
          <span>{formatCurrency(high)}</span>
        </div>
      )}
      
      {/* The range bar */}
      <div 
        className="relative h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"
        title={`Current: ${formatCurrency(currentSalary)} | Median: ${formatCurrency(adjustedMedian)} | ${percentOfMedian.toFixed(0)}% of median`}
      >
        {/* Fill from left to current position */}
        <div 
          className={cn("absolute left-0 top-0 h-full transition-all", fillColor)}
          style={{ width: `${barPosition}%` }}
        />
        
        {/* 75% marker (light) */}
        <div 
          className="absolute top-0 h-full w-px bg-gray-300 dark:bg-gray-600"
          style={{ left: '25%' }}
        />
        
        {/* Median marker (100%) - the target */}
        <div 
          className="absolute top-0 h-full w-0.5 bg-gray-500 dark:bg-gray-400"
          style={{ left: '50%' }}
        />
        
        {/* 125% marker (light) */}
        <div 
          className="absolute top-0 h-full w-px bg-gray-300 dark:bg-gray-600"
          style={{ left: '75%' }}
        />
        
        {/* Current salary marker */}
        <div 
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-md transition-all",
            markerColor
          )}
          style={{ left: `calc(${barPosition}% - 6px)` }}
        />
        
        {/* Percentage label on the bar */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn(
            "text-[10px] font-bold",
            percentOfMedian < 80 ? "text-red-700" : 
            percentOfMedian > 120 ? "text-green-700" : 
            "text-gray-700 dark:text-gray-300"
          )}>
            {percentOfMedian.toFixed(0)}%
          </span>
        </div>
      </div>
      
      {/* Scale labels */}
      {showLabels && (
        <div className="flex justify-between text-[9px] text-muted-foreground px-0.5">
          <span>50%</span>
          <span>75%</span>
          <span className="font-medium">100%</span>
          <span>125%</span>
          <span>150%</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for table rows
 */
export function SalaryRangeBarCompact({ 
  currentSalary, 
  adjustedMedian,
}: { 
  currentSalary: number | null;
  adjustedMedian: number | null;
}) {
  if (!currentSalary || !adjustedMedian) {
    return <div className="w-24 h-2 bg-muted rounded" />;
  }

  const percentOfMedian = (currentSalary / adjustedMedian) * 100;
  const minRange = 50;
  const maxRange = 150;
  const rangeSpan = maxRange - minRange;
  const barPosition = Math.max(0, Math.min(100, ((percentOfMedian - minRange) / rangeSpan) * 100));
  
  const isUnderpaid = percentOfMedian < 95;
  const markerColor = isUnderpaid ? 'bg-red-500' : percentOfMedian > 105 ? 'bg-green-500' : 'bg-blue-500';
  const fillColor = isUnderpaid ? 'bg-red-200' : percentOfMedian > 105 ? 'bg-green-200' : 'bg-blue-200';

  return (
    <div 
      className="relative w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
      title={`${percentOfMedian.toFixed(0)}% of adjusted median`}
    >
      <div className={cn("absolute left-0 top-0 h-full", fillColor)} style={{ width: `${barPosition}%` }} />
      <div className="absolute top-0 h-full w-px bg-gray-400" style={{ left: '50%' }} />
      <div 
        className={cn("absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full", markerColor)}
        style={{ left: `calc(${barPosition}% - 4px)` }}
      />
    </div>
  );
}
