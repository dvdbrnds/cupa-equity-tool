import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cupaCatalogApi } from '@/services/api';
import type { CupaPosition, PaginatedResponse } from '@cupa/shared';
import { debounce } from '@/lib/utils';

export function CupaCatalogPage() {
  const [positions, setPositions] = useState<PaginatedResponse<CupaPosition> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedPosition, setSelectedPosition] = useState<CupaPosition | null>(null);

  const loadPositions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await cupaCatalogApi.list({
        page,
        limit: 25,
        search: search || undefined,
      });
      setPositions(data);
    } catch (error) {
      console.error('Failed to load CUPA catalog:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setSearch(value);
      setPage(1);
    }, 300),
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CUPA Catalog</h1>
        <p className="text-muted-foreground">
          Browse the CUPA-HR standardized position classifications
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by code, title, or description..."
              className="pl-10"
              onChange={(e) => debouncedSetSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Catalog List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {positions?.total || 0} Position{positions?.total !== 1 ? 's' : ''} in Catalog
          </CardTitle>
          <CardDescription>
            Click on a position to view full details
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : positions?.data.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No positions found</p>
              <p className="text-muted-foreground">
                {search ? 'Try a different search term' : 'Import the CUPA catalog to get started'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {positions?.data.map((position) => (
                  <div
                    key={position.cupaCode}
                    onClick={() => setSelectedPosition(position)}
                    className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold">{position.cupaCode}</span>
                          <Badge variant="secondary">{position.populationType}</Badge>
                        </div>
                        <p className="font-medium">{position.title}</p>
                        {position.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {position.description}
                          </p>
                        )}
                      </div>
                      {position.blsSocCode && (
                        <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                          <p>SOC: {position.blsSocCode}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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

      {/* Position Detail Dialog */}
      <Dialog open={!!selectedPosition} onOpenChange={() => setSelectedPosition(null)}>
        <DialogContent className="max-w-2xl">
          {selectedPosition && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono">{selectedPosition.cupaCode}</span>
                  <Badge variant="secondary">{selectedPosition.populationType}</Badge>
                </DialogTitle>
                <DialogDescription>{selectedPosition.title}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {selectedPosition.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm bg-muted p-4 rounded-lg whitespace-pre-wrap">
                      {selectedPosition.description}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selectedPosition.blsSocCode && (
                    <div>
                      <p className="text-muted-foreground">BLS SOC Code</p>
                      <p className="font-medium">{selectedPosition.blsSocCode}</p>
                    </div>
                  )}
                  {selectedPosition.blsSocName && (
                    <div>
                      <p className="text-muted-foreground">BLS SOC Category</p>
                      <p className="font-medium">{selectedPosition.blsSocName}</p>
                    </div>
                  )}
                  {selectedPosition.category && (
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-medium">{selectedPosition.category}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Catalog Year</p>
                    <p className="font-medium">{selectedPosition.catalogYear}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
