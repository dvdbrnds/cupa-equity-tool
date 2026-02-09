import { Card, CardContent } from '@/components/ui/card';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

interface EquitySummaryCardsProps {
  totalGap: number;
  averageGap: number;
  positionsWithGap: number;
  analyzedPositions: number;
  totalProposedRaises?: number | null;
}

export function EquitySummaryCards({
  totalGap,
  averageGap,
  positionsWithGap,
  analyzedPositions,
  totalProposedRaises,
}: EquitySummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold text-red-600">{formatCurrency(totalGap)}</div>
          <p className="text-xs text-muted-foreground">Total Gap</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold">{formatCurrency(averageGap)}</div>
          <p className="text-xs text-muted-foreground">Average Gap</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold text-red-600">{positionsWithGap}</div>
          <p className="text-xs text-muted-foreground">Underpaid</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold text-green-600">
            {analyzedPositions - positionsWithGap}
          </div>
          <p className="text-xs text-muted-foreground">At/Above Median</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(totalProposedRaises ?? 0)}
          </div>
          <p className="text-xs text-muted-foreground">Proposed Raises</p>
        </CardContent>
      </Card>
    </div>
  );
}
