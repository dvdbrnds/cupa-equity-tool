import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, BookOpen, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cupaCatalogApi } from '@/services/api';
import type { CupaPosition, PaginatedResponse, AiCupaMatch } from '@cupa/shared';
import { debounce } from '@/lib/utils';

type ActiveTab = 'browse' | 'ai-match';

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) {
    return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">{score}% match</Badge>;
  }
  if (score >= 55) {
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">{score}% match</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100">{score}% match</Badge>;
}

export function CupaCatalogPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('browse');

  // Browse tab state
  const [positions, setPositions] = useState<PaginatedResponse<CupaPosition> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedPosition, setSelectedPosition] = useState<CupaPosition | null>(null);

  // AI Match tab state
  const [aiQuery, setAiQuery] = useState('');
  const [aiMatches, setAiMatches] = useState<AiCupaMatch[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSelectedPosition, setAiSelectedPosition] = useState<CupaPosition | null>(null);
  const [aiDetailLoading, setAiDetailLoading] = useState(false);

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

  async function handleAiMatch() {
    if (!aiQuery.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiMatches(null);
    try {
      const result = await cupaCatalogApi.aiMatch(aiQuery.trim());
      setAiMatches(result.matches);
      if (result.matches.length === 0) {
        setAiError('No strong matches found. Try rephrasing the title or adding more detail from the job description.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setAiError(message || 'Failed to get AI suggestions. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleViewDetails(match: AiCupaMatch) {
    setAiDetailLoading(true);
    try {
      const pos = await cupaCatalogApi.get(match.cupaCode);
      setAiSelectedPosition(pos);
    } catch {
      // Fall back to constructing from match data
      setAiSelectedPosition({
        cupaCode: match.cupaCode,
        title: match.title,
        description: match.description ?? '',
        category: null,
        blsSocCode: null,
        blsSocName: null,
        populationType: match.populationType,
        catalogYear: '',
      });
    } finally {
      setAiDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CUPA Catalog</h1>
        <p className="text-muted-foreground">
          Browse standardized CUPA-HR position classifications or use AI to find the best match
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('browse')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'browse'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Search className="inline h-4 w-4 mr-2 -mt-0.5" />
          Browse Catalog
        </button>
        <button
          onClick={() => setActiveTab('ai-match')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ai-match'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles className="inline h-4 w-4 mr-2 -mt-0.5" />
          AI Match
        </button>
      </div>

      {/* ── Browse Tab ── */}
      {activeTab === 'browse' && (
        <>
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

          <Card>
            <CardHeader>
              <CardTitle>
                {positions?.total || 0} Position{positions?.total !== 1 ? 's' : ''} in Catalog
              </CardTitle>
              <CardDescription>Click on a position to view full details</CardDescription>
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
        </>
      )}

      {/* ── AI Match Tab ── */}
      {activeTab === 'ai-match' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI-Powered CUPA Matching
              </CardTitle>
              <CardDescription>
                Enter a job title or paste a job description. The AI will search the full CUPA catalog and return
                the closest matches with explanations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="E.g. &quot;Director of Student Financial Services&quot; or paste a full job description..."
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                rows={4}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleAiMatch();
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {aiQuery.length}/2000 characters &nbsp;·&nbsp; Press ⌘↵ to run
                </p>
                <Button
                  onClick={handleAiMatch}
                  disabled={aiLoading || aiQuery.trim().length < 2}
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Searching…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Find Matches
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error state */}
          {aiError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {aiMatches && aiMatches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Matches</CardTitle>
                <CardDescription>
                  {aiMatches.length} result{aiMatches.length !== 1 ? 's' : ''} ranked by relevance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiMatches.map((match, idx) => (
                  <div
                    key={match.cupaCode}
                    className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                        <span className="text-sm font-medium text-muted-foreground w-5">#{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono font-bold text-sm">{match.cupaCode}</span>
                          <Badge variant="secondary" className="text-xs">{match.populationType}</Badge>
                          <ScoreBadge score={match.score} />
                        </div>
                        <p className="font-medium">{match.title}</p>
                        {match.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {match.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-start gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground italic">{match.reasoning}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                        disabled={aiDetailLoading}
                        onClick={() => handleViewDetails(match)}
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Position Detail Dialog (Browse tab) */}
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
                  {selectedPosition.catalogYear && (
                    <div>
                      <p className="text-muted-foreground">Catalog Year</p>
                      <p className="font-medium">{selectedPosition.catalogYear}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Position Detail Dialog (AI Match tab) */}
      <Dialog open={!!aiSelectedPosition} onOpenChange={() => setAiSelectedPosition(null)}>
        <DialogContent className="max-w-2xl">
          {aiSelectedPosition && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono">{aiSelectedPosition.cupaCode}</span>
                  <Badge variant="secondary">{aiSelectedPosition.populationType}</Badge>
                </DialogTitle>
                <DialogDescription>{aiSelectedPosition.title}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {aiSelectedPosition.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm bg-muted p-4 rounded-lg whitespace-pre-wrap">
                      {aiSelectedPosition.description}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {aiSelectedPosition.blsSocCode && (
                    <div>
                      <p className="text-muted-foreground">BLS SOC Code</p>
                      <p className="font-medium">{aiSelectedPosition.blsSocCode}</p>
                    </div>
                  )}
                  {aiSelectedPosition.blsSocName && (
                    <div>
                      <p className="text-muted-foreground">BLS SOC Category</p>
                      <p className="font-medium">{aiSelectedPosition.blsSocName}</p>
                    </div>
                  )}
                  {aiSelectedPosition.category && (
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-medium">{aiSelectedPosition.category}</p>
                    </div>
                  )}
                  {aiSelectedPosition.catalogYear && (
                    <div>
                      <p className="text-muted-foreground">Catalog Year</p>
                      <p className="font-medium">{aiSelectedPosition.catalogYear}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
