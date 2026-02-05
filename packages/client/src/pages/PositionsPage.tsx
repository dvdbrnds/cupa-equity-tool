import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { positionsApi } from '@/services/api';
import type { PositionMappingWithCupa, PaginatedResponse } from '@cupa/shared';
import { AUDIT_STATUSES } from '@cupa/shared';
import { debounce } from '@/lib/utils';

export function PositionsPage() {
  const [positions, setPositions] = useState<PaginatedResponse<PositionMappingWithCupa> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [vpStemFilter, setVpStemFilter] = useState<string>('');
  const [vpStems, setVpStems] = useState<Array<{ vpStem: string; count: number }>>([]);
  const [page, setPage] = useState(1);

  const loadPositions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await positionsApi.list({
        page,
        limit: 25,
        search: search || undefined,
        auditStatus: statusFilter || undefined,
        vpStem: vpStemFilter || undefined,
      });
      setPositions(data);
    } catch (error) {
      console.error('Failed to load positions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, vpStemFilter]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  useEffect(() => {
    positionsApi.getVpStems().then(setVpStems).catch(console.error);
  }, []);

  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setSearch(value);
      setPage(1);
    }, 300),
    []
  );

  const getStatusBadge = (status: string) => {
    const config = AUDIT_STATUSES[status as keyof typeof AUDIT_STATUSES];
    const variant = status === 'confirmed' ? 'success' :
                   status === 'flagged' ? 'red' :
                   status === 'resolved' ? 'purple' :
                   status === 'pending' ? 'warning' : 'gray';
    return <Badge variant={variant}>{config?.label || status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Positions</h1>
        <p className="text-muted-foreground">
          View and manage institutional position mappings
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, title, or employee ID..."
                className="pl-10"
                onChange={(e) => debouncedSetSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(AUDIT_STATUSES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vpStemFilter || 'all'} onValueChange={(v) => { setVpStemFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Divisions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  {vpStems.filter(({ vpStem }) => vpStem && vpStem.trim() !== '').map(({ vpStem, count }) => (
                    <SelectItem key={vpStem} value={vpStem}>
                      {vpStem.length > 30 ? vpStem.slice(0, 30) + '...' : vpStem} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {positions?.total || 0} Position{positions?.total !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : positions?.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No positions found matching your criteria
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Employee</th>
                      <th className="text-left py-3 px-4 font-medium">Institutional Title</th>
                      <th className="text-left py-3 px-4 font-medium">CUPA Mapping</th>
                      <th className="text-left py-3 px-4 font-medium">Division</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-right py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions?.data.map((position) => (
                      <tr key={position.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{position.employeeName}</p>
                            <p className="text-xs text-muted-foreground">{position.employeeId}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">{position.institutionalTitle}</td>
                        <td className="py-3 px-4">
                          {position.cupaCode ? (
                            <div>
                              <p className="font-mono text-sm">{position.cupaCode}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {position.cupaTitle}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Not mapped</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <p className="truncate max-w-[150px]" title={position.vpStem}>
                            {position.vpStem}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(position.auditStatus)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/positions/${position.id}`}>View</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {positions && positions.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {positions.page} of {positions.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p - 1)}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= positions.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
