import { useEffect, useState, useCallback, useMemo } from 'react';
import { Download, Minus, AlertCircle, CheckCircle, Camera, Users, ArrowLeft, Building2, ChevronRight, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/context/AuthContext';
import { equityAnalysisApi, vpRolesApi } from '@/services/api';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';
import type { VpRole } from '@cupa/shared';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

interface EmployeeHistory {
  employeeId: string;
  employeeName: string;
  vpStem: string;
  department: string;
  institutionalTitle: string;
  years: Array<{ year: string; salary: number | null; gap: number | null; raiseGiven: number | null }>;
  gapTrend: 'improving' | 'worsening' | 'stable' | 'unknown';
  totalRaisesReceived: number;
  currentGap: number | null;
}

interface HistorySummary {
  years: string[];
  totalRaisesByYear: Array<{ year: string; totalRaises: number; avgRaise: number; employeesHelped: number }>;
  employeesWithClosedGap: number;
  employeesStillNeedingHelp: number;
}

interface YearReview {
  year: string;
  totalRaises: number;
  employeeCount: number;
}

interface VpReviewSummary {
  vpStem: string;
  vpTitle: string;
  employeeCount: number;
  totalRaises: number;
  reviews: YearReview[];
}

export function ReviewHistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<EmployeeHistory[]>([]);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [vpRoles, setVpRoles] = useState<VpRole[]>([]);
  const [selectedVp, setSelectedVp] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Always load all data - we'll filter client-side
      const [historyData, summaryData] = await Promise.all([
        equityAnalysisApi.getHistory(),
        equityAnalysisApi.getHistorySummary(),
      ]);
      setHistory(historyData);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to load history:', err);
      setError('Failed to load review history data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    async function loadVpRoles() {
      try {
        const roles = await vpRolesApi.list();
        setVpRoles(roles);
      } catch (err) {
        console.error('Failed to load VP roles:', err);
      }
    }
    if (isInstitutionWide) {
      loadVpRoles();
    }
  }, [isInstitutionWide]);

  // Compute VP summaries from history data with year-by-year breakdown
  const vpSummaries = useMemo<VpReviewSummary[]>(() => {
    const vpMap = new Map<string, {
      vpStem: string;
      vpTitle: string;
      employeeCount: number;
      totalRaises: number;
      yearMap: Map<string, { totalRaises: number; employees: Set<string> }>;
    }>();
    
    for (const employee of history) {
      if (!vpMap.has(employee.vpStem)) {
        const vpRole = vpRoles.find(v => v.code === employee.vpStem);
        vpMap.set(employee.vpStem, {
          vpStem: employee.vpStem,
          vpTitle: vpRole?.title || employee.vpStem,
          employeeCount: 0,
          totalRaises: 0,
          yearMap: new Map(),
        });
      }
      
      const vp = vpMap.get(employee.vpStem)!;
      vp.employeeCount++;
      vp.totalRaises += employee.totalRaisesReceived;
      
      // Track raises by year
      for (const yearData of employee.years) {
        if (yearData.raiseGiven && yearData.raiseGiven > 0) {
          if (!vp.yearMap.has(yearData.year)) {
            vp.yearMap.set(yearData.year, { totalRaises: 0, employees: new Set() });
          }
          const yearInfo = vp.yearMap.get(yearData.year)!;
          yearInfo.totalRaises += yearData.raiseGiven;
          yearInfo.employees.add(employee.employeeId);
        }
      }
    }
    
    // Convert to final format with reviews array
    return Array.from(vpMap.values())
      .map(vp => ({
        vpStem: vp.vpStem,
        vpTitle: vp.vpTitle,
        employeeCount: vp.employeeCount,
        totalRaises: vp.totalRaises,
        reviews: Array.from(vp.yearMap.entries())
          .map(([year, data]) => ({
            year,
            totalRaises: data.totalRaises,
            employeeCount: data.employees.size,
          }))
          .sort((a, b) => b.year.localeCompare(a.year)), // Most recent first
      }))
      .sort((a, b) => a.vpStem.localeCompare(b.vpStem));
  }, [history, vpRoles]);

  // Filter history by selected VP and year
  const filteredHistory = useMemo(() => {
    if (!selectedVp) return history;
    let filtered = history.filter(e => e.vpStem === selectedVp);
    
    // If a specific year is selected, only show employees who got raises that year
    if (selectedYear) {
      filtered = filtered.filter(e => 
        e.years.some(y => y.year === selectedYear && y.raiseGiven && y.raiseGiven > 0)
      );
    }
    
    return filtered;
  }, [history, selectedVp, selectedYear]);

  // Get selected VP info
  const selectedVpInfo = useMemo(() => {
    if (!selectedVp) return null;
    return vpSummaries.find(v => v.vpStem === selectedVp) || null;
  }, [selectedVp, vpSummaries]);

  // Get selected year review info
  const selectedReviewInfo = useMemo(() => {
    if (!selectedVp || !selectedYear || !selectedVpInfo) return null;
    return selectedVpInfo.reviews.find(r => r.year === selectedYear) || null;
  }, [selectedVp, selectedYear, selectedVpInfo]);

  async function handleCreateSnapshot() {
    const year = new Date().getFullYear().toString();
    setIsCreatingSnapshot(true);
    try {
      const result = await equityAnalysisApi.createSnapshot(year);
      await loadData();
      alert(`Created snapshot for ${result.snapshotCount} employees`);
    } catch (err) {
      console.error('Failed to create snapshot:', err);
      setError('Failed to create salary snapshot');
    } finally {
      setIsCreatingSnapshot(false);
    }
  }

  // Get all unique years from filtered history data
  const allYears = useMemo(() => {
    const years = new Set<string>();
    for (const employee of filteredHistory) {
      for (const yearData of employee.years) {
        years.add(yearData.year);
      }
    }
    return Array.from(years).sort();
  }, [filteredHistory]);

  // Calculate total raises given across all years (from filtered data)
  const totalRaisesGiven = filteredHistory.reduce((sum, e) => sum + e.totalRaisesReceived, 0);
  const totalEmployeesHelped = filteredHistory.filter(e => e.totalRaisesReceived > 0).length;

  function getTrendBadge(trend: string) {
    switch (trend) {
      case 'improving':
        return <Badge variant="green" className="gap-1"><CheckCircle className="h-3 w-3" /> Improving</Badge>;
      case 'worsening':
        return <Badge variant="red" className="gap-1"><AlertCircle className="h-3 w-3" /> Needs Help</Badge>;
      case 'stable':
        return <Badge variant="blue" className="gap-1"><Minus className="h-3 w-3" /> Stable</Badge>;
      default:
        return <Badge variant="gray">Unknown</Badge>;
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Handle back navigation
  function handleBack() {
    if (selectedYear) {
      setSelectedYear(null);
    } else {
      setSelectedVp(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {selectedVp && selectedVpInfo ? (
            <>
              <div className="flex items-center gap-3 mb-1">
                <Button variant="outline" size="sm" onClick={handleBack} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {selectedYear ? selectedVpInfo.vpTitle : 'All Divisions'}
                </Button>
              </div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                {selectedVpInfo.vpTitle}
                {selectedYear && (
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    <Calendar className="h-4 w-4 mr-1" />
                    {selectedYear} Review
                  </Badge>
                )}
              </h1>
              <p className="text-muted-foreground">
                {selectedYear 
                  ? `${selectedReviewInfo?.employeeCount || 0} employees received raises totaling ${formatCurrency(selectedReviewInfo?.totalRaises || 0)}`
                  : `Review history for ${selectedVpInfo.vpStem} division`
                }
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">Review History</h1>
              <p className="text-muted-foreground">
                Track submitted equity reviews by VP division
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {isInstitutionWide && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCreateSnapshot}
              disabled={isCreatingSnapshot}
            >
              <Camera className="h-4 w-4 mr-2" />
              {isCreatingSnapshot ? 'Creating...' : 'Create Snapshot'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => equityAnalysisApi.export()}>
            <Download className="h-4 w-4 mr-2" />
            Export
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

      {/* Main content - VP Divisions as horizontal rows with nested reviews */}
      {!selectedVp && (
        <>
          {/* Overall Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{vpSummaries.length}</div>
                <p className="text-xs text-muted-foreground">Divisions with Reviews</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRaisesGiven)}</div>
                <p className="text-xs text-muted-foreground">Total Raises Given</p>
                <p className="text-xs text-muted-foreground mt-1">Across all divisions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{history.length}</div>
                <p className="text-xs text-muted-foreground">Employees in History</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{allYears.length > 0 ? allYears.join(', ') : '-'}</div>
                <p className="text-xs text-muted-foreground">Review Years</p>
              </CardContent>
            </Card>
          </div>

          {/* VP Divisions as horizontal rows */}
          {vpSummaries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No reviews submitted yet</p>
                <p className="text-muted-foreground mb-4">
                  Submit equity reviews from the Dashboard to see them here.
                </p>
                {isInstitutionWide && (
                  <Button onClick={handleCreateSnapshot} disabled={isCreatingSnapshot}>
                    <Camera className="h-4 w-4 mr-2" />
                    Create Initial Snapshot
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {vpSummaries.map(vp => (
                <Card key={vp.vpStem}>
                  {/* VP Header Row */}
                  <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-6 w-6 text-primary" />
                      <div>
                        <h3 className="font-semibold text-lg">{vp.vpTitle}</h3>
                        <p className="text-sm text-muted-foreground">{vp.vpStem}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600">{formatCurrency(vp.totalRaises)}</div>
                        <p className="text-xs text-muted-foreground">Total Raises</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold flex items-center gap-1 justify-end">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {vp.employeeCount}
                        </div>
                        <p className="text-xs text-muted-foreground">Employees</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold">{vp.reviews.length}</div>
                        <p className="text-xs text-muted-foreground">Reviews</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Nested Reviews */}
                  <CardContent className="p-0">
                    {vp.reviews.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        No completed reviews yet
                      </div>
                    ) : (
                      <div className="divide-y">
                        {vp.reviews.map(review => (
                          <div 
                            key={review.year}
                            className="flex items-center justify-between p-4 hover:bg-muted/20 cursor-pointer transition-colors"
                            onClick={() => {
                              setSelectedVp(vp.vpStem);
                              setSelectedYear(review.year);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="text-base px-3 py-1">
                                <Calendar className="h-4 w-4 mr-2" />
                                {review.year}
                              </Badge>
                              <span className="text-muted-foreground">Equity Review</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <span className="font-semibold text-green-600">{formatCurrency(review.totalRaises)}</span>
                                <span className="text-muted-foreground text-sm ml-1">raises</span>
                              </div>
                              <div className="text-right">
                                <span className="font-semibold">{review.employeeCount}</span>
                                <span className="text-muted-foreground text-sm ml-1">employees</span>
                              </div>
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Show detailed employee list when a VP + Year is selected */}
      {selectedVp && selectedVpInfo && selectedYear && (
        <>
          {/* Summary Cards for selected review */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{formatCurrency(selectedReviewInfo?.totalRaises || 0)}</div>
                <p className="text-xs text-muted-foreground">Total Raises</p>
                <p className="text-xs text-muted-foreground mt-1">{selectedYear} Review</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{selectedReviewInfo?.employeeCount || 0}</div>
                <p className="text-xs text-muted-foreground">Employees</p>
                <p className="text-xs text-muted-foreground mt-1">Received raises</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {(selectedReviewInfo?.employeeCount || 0) > 0 
                    ? formatCurrency((selectedReviewInfo?.totalRaises || 0) / (selectedReviewInfo?.employeeCount || 1))
                    : '-'
                  }
                </div>
                <p className="text-xs text-muted-foreground">Average Raise</p>
                <p className="text-xs text-muted-foreground mt-1">Per employee</p>
              </CardContent>
            </Card>
          </div>

          {/* Employee Table for this review */}
          <Card>
            <CardHeader>
              <CardTitle>Employees - {selectedYear} Review</CardTitle>
              <CardDescription>
                Employees who received raises in the {selectedYear} equity review
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Employee</th>
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">Department</th>
                      <th className="text-right p-3 font-medium">Salary</th>
                      <th className="text-right p-3 font-medium">Gap</th>
                      <th className="text-right p-3 font-medium">Raise Given</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map(employee => {
                      const yearData = employee.years.find(y => y.year === selectedYear);
                      if (!yearData || !yearData.raiseGiven || yearData.raiseGiven <= 0) return null;
                      
                      return (
                        <tr key={employee.employeeId} className="border-t hover:bg-muted/30">
                          <td className="p-3 font-medium">{employee.employeeName}</td>
                          <td className="p-3 text-muted-foreground">{employee.institutionalTitle}</td>
                          <td className="p-3 text-muted-foreground">{employee.department}</td>
                          <td className="p-3 text-right font-mono">
                            {yearData.salary !== null ? formatCurrency(yearData.salary) : '-'}
                          </td>
                          <td className="p-3 text-right font-mono">
                            <span className={yearData.gap !== null && yearData.gap > 0 ? 'text-red-600' : 'text-green-600'}>
                              {yearData.gap !== null ? formatCurrency(yearData.gap) : '-'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono">
                            <span className="text-green-600 font-semibold">
                              +{formatCurrency(yearData.raiseGiven)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Show VP overview with all reviews when VP selected but no year */}
      {selectedVp && selectedVpInfo && !selectedYear && (
        <>
          {/* Summary Cards for selected VP */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{formatCurrency(selectedVpInfo.totalRaises)}</div>
                <p className="text-xs text-muted-foreground">Total Raises Given</p>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{selectedVpInfo.employeeCount}</div>
                <p className="text-xs text-muted-foreground">Employees</p>
                <p className="text-xs text-muted-foreground mt-1">In history</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{selectedVpInfo.reviews.length}</div>
                <p className="text-xs text-muted-foreground">Completed Reviews</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {selectedVpInfo.employeeCount > 0 
                    ? formatCurrency(selectedVpInfo.totalRaises / selectedVpInfo.employeeCount)
                    : '-'
                  }
                </div>
                <p className="text-xs text-muted-foreground">Average Raise</p>
                <p className="text-xs text-muted-foreground mt-1">Per employee</p>
              </CardContent>
            </Card>
          </div>

          {/* List of reviews for this VP */}
          <Card>
            <CardHeader>
              <CardTitle>Reviews for {selectedVpInfo.vpTitle}</CardTitle>
              <CardDescription>
                Click on a review to see employee details
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {selectedVpInfo.reviews.map(review => (
                  <div 
                    key={review.year}
                    className="flex items-center justify-between p-4 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedYear(review.year)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-base px-3 py-1">
                        <Calendar className="h-4 w-4 mr-2" />
                        {review.year}
                      </Badge>
                      <span className="text-muted-foreground">Equity Review</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="font-semibold text-green-600">{formatCurrency(review.totalRaises)}</span>
                        <span className="text-muted-foreground text-sm ml-1">raises</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold">{review.employeeCount}</span>
                        <span className="text-muted-foreground text-sm ml-1">employees</span>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Multi-year employee history table */}
          <Card>
            <CardHeader>
              <CardTitle>Employee History - {selectedVpInfo.vpTitle}</CardTitle>
              <CardDescription>
                Multi-year comparison showing salary changes and equity gaps
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium sticky left-0 bg-muted/50">Employee</th>
                      {allYears.map(year => (
                        <th key={`salary-${year}`} className="text-right p-3 font-medium">
                          {year} Salary
                        </th>
                      ))}
                      {allYears.map(year => (
                        <th key={`gap-${year}`} className="text-right p-3 font-medium">
                          {year} Gap
                        </th>
                      ))}
                      <th className="text-center p-3 font-medium">Trend</th>
                      <th className="text-right p-3 font-medium">Total Raises</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map(employee => {
                      const yearMap = new Map(employee.years.map(y => [y.year, y]));
                      
                      return (
                        <tr key={employee.employeeId} className="border-t hover:bg-muted/30">
                          <td className="p-3 sticky left-0 bg-card">
                            <div className="font-medium">{employee.employeeName}</div>
                            <div className="text-xs text-muted-foreground">{employee.institutionalTitle}</div>
                            <div className="text-xs text-muted-foreground">{employee.department}</div>
                          </td>
                          {allYears.map(year => {
                            const data = yearMap.get(year);
                            return (
                              <td key={`salary-${year}`} className="p-3 text-right font-mono">
                                {data?.salary !== null && data?.salary !== undefined
                                  ? formatCurrency(data.salary)
                                  : '-'
                                }
                                {data?.raiseGiven && data.raiseGiven > 0 && (
                                  <div className="text-xs text-green-600">
                                    +{formatCurrency(data.raiseGiven)}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          {allYears.map(year => {
                            const data = yearMap.get(year);
                            const gap = data?.gap;
                            return (
                              <td key={`gap-${year}`} className="p-3 text-right font-mono">
                                <span className={
                                  gap !== null && gap !== undefined
                                    ? gap > 0 ? 'text-red-600' : 'text-green-600'
                                    : ''
                                }>
                                  {gap !== null && gap !== undefined ? formatCurrency(gap) : '-'}
                                </span>
                              </td>
                            );
                          })}
                          <td className="p-3 text-center">
                            {getTrendBadge(employee.gapTrend)}
                          </td>
                          <td className="p-3 text-right font-mono">
                            <span className={employee.totalRaisesReceived > 0 ? 'text-green-600 font-semibold' : ''}>
                              {formatCurrency(employee.totalRaisesReceived)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
