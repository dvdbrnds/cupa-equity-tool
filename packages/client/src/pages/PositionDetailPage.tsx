import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, User, Building, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { positionsApi, reviewsApi } from '@/services/api';
import type { PositionMappingWithCupa, ReviewCommentWithUser } from '@cupa/shared';
import { AUDIT_STATUSES } from '@cupa/shared';
import { formatDateTime } from '@/lib/utils';

export function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [position, setPosition] = useState<PositionMappingWithCupa | null>(null);
  const [comments, setComments] = useState<ReviewCommentWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      try {
        const [positionData, commentsData] = await Promise.all([
          positionsApi.get(parseInt(id)),
          reviewsApi.getComments(parseInt(id)),
        ]);
        setPosition(positionData);
        setComments(commentsData);
      } catch (error) {
        console.error('Failed to load position:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!position) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Position not found</p>
        <Button asChild variant="link" className="mt-4">
          <Link to="/positions">Back to Positions</Link>
        </Button>
      </div>
    );
  }

  const statusConfig = AUDIT_STATUSES[position.auditStatus as keyof typeof AUDIT_STATUSES];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/positions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{position.employeeName}</h1>
          <p className="text-muted-foreground">{position.institutionalTitle}</p>
        </div>
        <Badge 
          variant={
            position.auditStatus === 'confirmed' ? 'success' :
            position.auditStatus === 'flagged' ? 'red' :
            position.auditStatus === 'resolved' ? 'purple' : 'gray'
          }
          className="ml-auto"
        >
          {statusConfig?.label || position.auditStatus}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Employee Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Employee Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Employee ID</p>
              <p className="font-medium">{position.employeeId}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{position.employeeName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Institutional Title</p>
              <p className="font-medium">{position.institutionalTitle}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Supervisor</p>
              <p className="font-medium">{position.supervisor || '-'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Organization */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Division</p>
              <p className="font-medium">{position.division}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Department</p>
              <p className="font-medium">{position.department}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">VP Stem</p>
              <p className="font-medium">{position.vpStem}</p>
            </div>
          </CardContent>
        </Card>

        {/* CUPA Mapping */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              CUPA Classification
            </CardTitle>
            <CardDescription>
              Standardized position classification from CUPA-HR
            </CardDescription>
          </CardHeader>
          <CardContent>
            {position.cupaCode ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">CUPA Code</p>
                    <p className="font-mono text-lg font-bold">{position.cupaCode}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">CUPA Title</p>
                    <p className="font-medium">{position.cupaTitle}</p>
                  </div>
                </div>
                {position.cupaDescription && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Description</p>
                    <p className="text-sm bg-muted p-3 rounded-md">{position.cupaDescription}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No CUPA code assigned</p>
                <p className="text-sm">This position needs to be mapped to a CUPA classification</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comments */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Review History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {comments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No review comments yet</p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{comment.userName}</span>
                        <Badge variant="secondary" className="text-xs">{comment.userRole}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                    {comment.flagReason && (
                      <Badge variant="red" className="mb-2">
                        Flagged: {comment.flagReason.replace('_', ' ')}
                      </Badge>
                    )}
                    <p className="text-sm">{comment.comment}</p>
                    {comment.suggestedCupaCode && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Suggested CUPA Code: <span className="font-mono">{comment.suggestedCupaCode}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
