import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, DollarSign, Users, TrendingUp, AlertCircle, Download, RefreshCw, ArrowLeft, Filter, LayoutGrid, Table as TableIcon, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SalaryRangeBar, SalaryRangeBarCompact } from '@/components/ui/salary-range-bar';
import { useAuth } from '@/context/AuthContext';
import { equityAnalysisApi } from '@/services/api';
import { AdjustmentPanel } from '@/components/AdjustmentPanel';
import type { EquityAnalysisSummary, EquitySummaryByVp, EquityAnalysisWithPosition } from '@cupa/shared';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Summary state
  const [summary, setSummary] = useState<EquityAnalysisSummary | null>(null);
  const [vpSummary, setVpSummary] = useState<EquitySummaryByVp[]>([]);
  const [salaryYears, setSalaryYears] = useState<Array<{ data_year: string; count: number }>>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showCalculateDialog, setShowCalculateDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VP Detail state
  const [selectedVp, setSelectedVp] = useState<EquitySummaryByVp | null>(null);
  const [positions, setPositions] = useState<EquityAnalysisWithPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [totalPositionCount, setTotalPositionCount] = useState(0);
  const [page, setPage] = useState(1);
  const [compensationType, setCompensationType] = useState<string>('all');
  const [gapOnly, setGapOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [editingRaise, setEditingRaise] = useState<{ [key: number]: string }>({});
  const [savingRaise, setSavingRaise] = useState<number | null>(null);
  const limit = 50;

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  useEffect(() => {
    loadSummaryData();
  }, []);

  // Load positions when VP is selected or filters change
  useEffect(() => {
    if (selectedVp) {
      loadPositions();
    }
  }, [selectedVp, compensationType, gapOnly, page]);

  async function loadSummaryData() {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryData, vpData, yearsData] = await Promise.all([
        equityAnalysisApi.getSummary(),
        equityAnalysisApi.getByVp(),
        equityAnalysisApi.getSalaryDataYears(),
      ]);
      setSummary(summaryData);
      setVpSummary(vpData);
      setSalaryYears(yearsData);
      if (yearsData.length > 0 && !selectedYear) {
        setSelectedYear(yearsData[0].data_year);
      }
    } catch (err) {
      console.error('Failed to load equity data:', err);
      setError('Failed to load equity analysis data');
    } finally {
      setIsLoading(false);
    }
  }

  // Auto-select VP division for non-institution-wide users (VPs)
  // This runs after data loads and when the user is determined
  useEffect(() => {
    if (!isInstitutionWide && vpSummary.length === 1 && !selectedVp && !isLoading) {
      setSelectedVp(vpSummary[0]);
    }
  }, [isInstitutionWide, vpSummary, selectedVp, isLoading]);

  async function loadPositions() {
    if (!selectedVp) return;
    setPositionsLoading(true);
    try {
      const positionsData = await equityAnalysisApi.getPositions({
        vpStem: selectedVp.vpStem,
        compensationType: compensationType !== 'all' ? compensationType : undefined,
        gapOnly,
        page,
        limit,
      });
      setPositions(positionsData.data);
      setTotalPositionCount(positionsData.total);
      
      // Initialize editing state with current proposed raises
      const raises: { [key: number]: string } = {};
      positionsData.data.forEach(p => {
        if (p.proposedRaise && p.proposedRaise > 0) {
          raises[p.positionMappingId] = String(p.proposedRaise);
        }
      });
      setEditingRaise(raises);
    } catch (err) {
      console.error('Failed to load positions:', err);
    } finally {
      setPositionsLoading(false);
    }
  }

  async function handleCalculate() {
    if (!selectedYear) return;
    setIsCalculating(true);
    setError(null);
    try {
      const result = await equityAnalysisApi.calculate(selectedYear);
      if (result.success) {
        setShowCalculateDialog(false);
        setSelectedVp(null);
        await loadSummaryData();
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('Failed to calculate equity:', err);
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setIsCalculating(false);
    }
  }

  function handleVpClick(vp: EquitySummaryByVp) {
    if (selectedVp?.vpStem === vp.vpStem) {
      // Clicking same VP deselects
      setSelectedVp(null);
      setPositions([]);
    } else {
      setSelectedVp(vp);
      setPage(1);
      setCompensationType('all');
      setGapOnly(false);
    }
  }

  function handleBackToAll() {
    setSelectedVp(null);
    setPositions([]);
    loadSummaryData();
  }

  async function handleRaiseChange(positionMappingId: number, value: string) {
    setEditingRaise(prev => ({ ...prev, [positionMappingId]: value }));
  }

  async function handleRaiseBlur(positionMappingId: number) {
    const value = editingRaise[positionMappingId];
    const amount = parseFloat(value?.replace(/[,$]/g, '') || '0');
    
    setSavingRaise(positionMappingId);
    try {
      await equityAnalysisApi.proposeRaise(positionMappingId, amount);
      // Update local state
      setPositions(prev => prev.map(p => 
        p.positionMappingId === positionMappingId 
          ? { ...p, proposedRaise: amount }
          : p
      ));
    } catch (err) {
      console.error('Failed to save raise:', err);
    } finally {
      setSavingRaise(null);
    }
  }

  async function handleBudgetAllocated() {
    await loadSummaryData();
    if (selectedVp) {
      await loadPositions();
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const hasAnalysis = summary && summary.analyzedPositions > 0;
  const hasNoData = !summary || summary.totalPositions === 0;

  // Calculate displayed stats - either overall or VP-specific
  const displayStats = selectedVp ? {
    totalGap: selectedVp.totalGap,
    averageGap: selectedVp.averageGap,
    medianGap: null as number | null,
    analyzedPositions: selectedVp.analyzedCount,
    totalPositions: selectedVp.positionCount,
    positionsWithGap: selectedVp.underpaidCount,
    totalProposedRaises: positions.reduce((sum, p) => sum + (p.proposedRaise || 0), 0),
  } : {
    totalGap: summary?.totalGap || 0,
    averageGap: summary?.averageGap || 0,
    medianGap: summary?.medianGap || null,
    analyzedPositions: summary?.analyzedPositions || 0,
    totalPositions: summary?.totalPositions || 0,
    positionsWithGap: summary?.positionsWithGap || 0,
    totalProposedRaises: null as number | null,
  };

  const totalPages = Math.ceil(totalPositionCount / limit);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main Content */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Only show back button for institution-wide users viewing a specific VP */}
            {selectedVp && isInstitutionWide && (
              <Button variant="outline" onClick={handleBackToAll} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                All Divisions
              </Button>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {selectedVp ? selectedVp.vpTitle || selectedVp.vpStem : 'Equity Dashboard'}
              </h1>
              <p className="text-muted-foreground">
                {selectedVp 
                  ? (isInstitutionWide ? 'Position equity details' : 'Equity analysis for your division')
                  : isInstitutionWide 
                    ? 'Institution-wide compensation equity analysis'
                    : 'Equity analysis for your division'
                }
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedVp && (
              <>
                <div className="border rounded-md p-0.5 flex">
                  <Button 
                    variant={viewMode === 'cards' ? 'default' : 'ghost'} 
                    size="sm"
                    onClick={() => setViewMode('cards')}
                    className="px-2"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant={viewMode === 'table' ? 'default' : 'ghost'} 
                    size="sm"
                    onClick={() => setViewMode('table')}
                    className="px-2"
                  >
                    <TableIcon className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => equityAnalysisApi.export()}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </>
            )}
            {!selectedVp && (
              <>
                <Button variant="outline" onClick={loadSummaryData} size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Dialog open={showCalculateDialog} onOpenChange={setShowCalculateDialog}>
                  <DialogTrigger asChild>
                    <Button variant={hasAnalysis ? 'outline' : 'default'} size="sm">
                      <Calculator className="h-4 w-4 mr-2" />
                      {hasAnalysis ? 'Recalculate' : 'Run Analysis'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Run Equity Analysis</DialogTitle>
                      <DialogDescription>
                        Calculate equity gaps for all positions using CUPA salary data
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>CUPA Salary Data Year</Label>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
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
                        {salaryYears.length === 0 && (
                          <p className="text-sm text-destructive mt-1">
                            No CUPA salary data imported. Please import salary data first.
                          </p>
                        )}
                      </div>
                      {error && showCalculateDialog && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                          {error}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCalculateDialog(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleCalculate} 
                        disabled={!selectedYear || isCalculating || salaryYears.length === 0}
                      >
                        {isCalculating ? 'Calculating...' : 'Calculate'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>

        {error && !showCalculateDialog && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {hasNoData ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No position data</p>
              <p className="text-muted-foreground mb-4">
                Import position data to begin equity analysis
              </p>
              <Button onClick={() => navigate('/import')}>
                Import Data
              </Button>
            </CardContent>
          </Card>
        ) : !hasAnalysis ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No equity analysis yet</p>
              <p className="text-muted-foreground mb-4">
                Run the equity calculator to analyze compensation gaps
              </p>
              <Button onClick={() => setShowCalculateDialog(true)}>
                <Calculator className="h-4 w-4 mr-2" />
                Run Analysis
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards - Unified format */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(displayStats.totalGap)}</div>
                  <p className="text-xs text-muted-foreground">Total Gap</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{formatCurrency(displayStats.averageGap)}</div>
                  <p className="text-xs text-muted-foreground">Average Gap</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">{displayStats.positionsWithGap}</div>
                  <p className="text-xs text-muted-foreground">Underpaid</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">
                    {displayStats.analyzedPositions - displayStats.positionsWithGap}
                  </div>
                  <p className="text-xs text-muted-foreground">At/Above Median</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-blue-600">
                    {selectedVp ? formatCurrency(displayStats.totalProposedRaises) : formatCurrency(0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Proposed Raises</p>
                </CardContent>
              </Card>
            </div>

            {/* VP Breakdown - Show when no VP selected */}
            {!selectedVp && (
              <Card>
                <CardHeader>
                  <CardTitle>Gap by VP Division</CardTitle>
                  <CardDescription>
                    Click a division to see individual positions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {vpSummary.map(vp => {
                      const gapPercentOfTotal = summary && summary.totalGap > 0 
                        ? (vp.totalGap / summary.totalGap) * 100 
                        : 0;
                      
                      return (
                        <div 
                          key={vp.vpStem} 
                          className="p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 cursor-pointer transition-colors group"
                          onClick={() => handleVpClick(vp)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div>
                                <div className="font-medium text-lg">{vp.vpTitle || vp.vpStem}</div>
                                <div className="text-sm text-muted-foreground">
                                  {vp.analyzedCount} of {vp.positionCount} analyzed
                                  {' • '}
                                  <span className="text-blue-600">{vp.salariedCount} salaried</span>
                                  {' • '}
                                  <span className="text-purple-600">{vp.hourlyCount} hourly</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="font-semibold text-red-600 text-lg">{formatCurrency(vp.totalGap)}</div>
                                <div className="text-sm text-muted-foreground">
                                  Avg: {formatCurrency(vp.averageGap)} ({formatPercent(vp.averageGapPercentage)})
                                </div>
                              </div>
                              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-red-500 transition-all"
                                style={{ width: `${Math.min(100, gapPercentOfTotal)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {formatPercent(gapPercentOfTotal)}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {vpSummary.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        No VP division data available
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Position Details - Show when VP is selected */}
            {selectedVp && (
              <>
                {/* Filters */}
                <div className="flex gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Filters:</span>
                  </div>
                  <Select value={compensationType} onValueChange={v => { setCompensationType(v); setPage(1); }}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="salaried">Salaried</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    variant={gapOnly ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => { setGapOnly(!gapOnly); setPage(1); }}
                  >
                    Underpaid Only
                  </Button>
                  <span className="text-sm text-muted-foreground ml-auto">
                    {totalPositionCount} position{totalPositionCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Positions Display */}
                {positionsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : positions.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No positions found
                    </CardContent>
                  </Card>
                ) : viewMode === 'cards' ? (
                  /* Visual Cards View */
                  <div className="space-y-3">
                    {positions.map(pos => {
                      const percentOfMedian = pos.currentSalary && pos.adjustedMedian 
                        ? (pos.currentSalary / pos.adjustedMedian) * 100 
                        : null;
                      const isUnderpaid = percentOfMedian !== null && percentOfMedian < 95;
                      const isOverpaid = percentOfMedian !== null && percentOfMedian > 105;
                      const newSalary = pos.currentSalary && pos.proposedRaise 
                        ? pos.currentSalary + pos.proposedRaise 
                        : pos.currentSalary;
                      const remainingGap = pos.equityGap !== null && pos.proposedRaise
                        ? pos.equityGap - pos.proposedRaise
                        : pos.equityGap;
                      
                      return (
                        <Card 
                          key={pos.id} 
                          className={
                            isUnderpaid ? 'border-l-4 border-l-red-500' : 
                            isOverpaid ? 'border-l-4 border-l-green-500' : 
                            'border-l-4 border-l-blue-500'
                          }
                        >
                          <CardContent className="p-4">
                            <div className="grid grid-cols-12 gap-4 items-center">
                              {/* Employee Info - 3 cols */}
                              <div className="col-span-3">
                                <div className="font-semibold">{pos.employeeName}</div>
                                <div className="text-sm text-muted-foreground">{pos.institutionalTitle}</div>
                                <div className="text-xs text-muted-foreground">{pos.department}</div>
                              </div>
                              
                              {/* CUPA Info - 2 cols */}
                              <div className="col-span-2">
                                {pos.cupaCode ? (
                                  <>
                                    <div className="font-mono text-xs text-muted-foreground">{pos.cupaCode}</div>
                                    <div className="text-xs truncate" title={pos.cupaTitle || ''}>{pos.cupaTitle}</div>
                                  </>
                                ) : (
                                  <Badge variant="outline" className="text-xs">No CUPA Code</Badge>
                                )}
                              </div>
                              
                              {/* Range Bar - 3 cols */}
                              <div className="col-span-3">
                                <SalaryRangeBar 
                                  currentSalary={pos.totalCompensation || pos.currentSalary}
                                  adjustedMedian={pos.adjustedMedian}
                                  baseMedian={pos.baseMedian}
                                  showLabels
                                />
                              </div>
                              
                              {/* Salary Numbers & Raise Input - 4 cols */}
                              <div className="col-span-4">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Current:</span>
                                      <span className="font-mono">{formatCurrency(pos.currentSalary)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Target:</span>
                                      <span className="font-mono">{formatCurrency(pos.adjustedMedian)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-semibold">
                                      <span className="text-muted-foreground">Gap:</span>
                                      <span className={pos.equityGap && pos.equityGap > 0 ? 'text-red-600' : 'text-green-600'}>
                                        {formatCurrency(pos.equityGap)}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Proposed Raise Input */}
                                  <div className="space-y-1">
                                    <div className="text-xs text-muted-foreground">Proposed Raise:</div>
                                    <Input
                                      type="text"
                                      placeholder="$0"
                                      value={editingRaise[pos.positionMappingId] || ''}
                                      onChange={(e) => handleRaiseChange(pos.positionMappingId, e.target.value)}
                                      onBlur={() => handleRaiseBlur(pos.positionMappingId)}
                                      className={`h-7 text-xs font-mono ${savingRaise === pos.positionMappingId ? 'opacity-50' : ''}`}
                                      disabled={savingRaise === pos.positionMappingId}
                                    />
                                    {pos.proposedRaise && pos.proposedRaise > 0 && (
                                      <div className="text-xs">
                                        <span className="text-muted-foreground">New: </span>
                                        <span className="font-mono text-blue-600">{formatCurrency(newSalary)}</span>
                                        <span className="text-muted-foreground ml-2">Gap: </span>
                                        <span className={`font-mono ${remainingGap && remainingGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          {formatCurrency(remainingGap)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Badges row */}
                            <div className="mt-2 pt-2 border-t flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">{pos.compensationType}</Badge>
                              {pos.fte < 1 && (
                                <Badge variant="outline" className="text-xs">{(pos.fte * 100).toFixed(0)}% FTE</Badge>
                              )}
                              {pos.appointmentMonths < 12 && (
                                <Badge variant="outline" className="text-xs">{pos.appointmentMonths}-month</Badge>
                              )}
                              {pos.yearsInRole !== null && (
                                <Badge variant="outline" className="text-xs">Year {pos.yearsInRole.toFixed(1)}</Badge>
                              )}
                              {pos.hasHousingBenefit && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Housing Benefit</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  /* Table View */
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-3 font-medium">Employee</th>
                              <th className="text-left p-3 font-medium">Title</th>
                              <th className="text-left p-3 font-medium">CUPA</th>
                              <th className="text-center p-3 font-medium">Range</th>
                              <th className="text-right p-3 font-medium">Current</th>
                              <th className="text-right p-3 font-medium">Target</th>
                              <th className="text-right p-3 font-medium">Gap</th>
                              <th className="text-right p-3 font-medium">Raise</th>
                            </tr>
                          </thead>
                          <tbody>
                            {positions.map(pos => (
                              <tr key={pos.id} className="border-t hover:bg-muted/30">
                                <td className="p-3">
                                  <div className="font-medium">{pos.employeeName}</div>
                                  <div className="text-xs text-muted-foreground">{pos.employeeId}</div>
                                </td>
                                <td className="p-3">
                                  <div>{pos.institutionalTitle}</div>
                                  <div className="text-xs text-muted-foreground">{pos.department}</div>
                                </td>
                                <td className="p-3">
                                  {pos.cupaCode ? (
                                    <div className="font-mono text-xs">{pos.cupaCode}</div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <SalaryRangeBarCompact 
                                    currentSalary={pos.totalCompensation || pos.currentSalary}
                                    adjustedMedian={pos.adjustedMedian}
                                  />
                                </td>
                                <td className="p-3 text-right font-mono">
                                  {formatCurrency(pos.currentSalary)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                  {formatCurrency(pos.adjustedMedian)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                  <span className={pos.equityGap && pos.equityGap > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                    {formatCurrency(pos.equityGap)}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <Input
                                    type="text"
                                    placeholder="$0"
                                    value={editingRaise[pos.positionMappingId] || ''}
                                    onChange={(e) => handleRaiseChange(pos.positionMappingId, e.target.value)}
                                    onBlur={() => handleRaiseBlur(pos.positionMappingId)}
                                    className={`h-7 w-24 text-xs font-mono ${savingRaise === pos.positionMappingId ? 'opacity-50' : ''}`}
                                    disabled={savingRaise === pos.positionMappingId}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalPositionCount)} of {totalPositionCount}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Right Panel - Adjustment Panel */}
      {hasAnalysis && (
        <div className="lg:block hidden">
          <AdjustmentPanel 
            totalGap={selectedVp ? selectedVp.totalGap : (summary?.totalGap || 0)}
            vpFilter={selectedVp?.vpStem}
            onBudgetAllocated={handleBudgetAllocated}
          />
        </div>
      )}

      {/* Mobile: Show adjustment panel below */}
      {hasAnalysis && (
        <div className="lg:hidden">
          <AdjustmentPanel 
            totalGap={selectedVp ? selectedVp.totalGap : (summary?.totalGap || 0)}
            vpFilter={selectedVp?.vpStem}
            onBudgetAllocated={handleBudgetAllocated}
          />
        </div>
      )}
    </div>
  );
}
