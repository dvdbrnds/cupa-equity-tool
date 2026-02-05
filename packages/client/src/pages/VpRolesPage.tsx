import { useEffect, useState } from 'react';
import { Building2, Users, User, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { vpRolesApi } from '@/services/api';
import type { VpRole } from '@cupa/shared';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function VpRolesPage() {
  const [roles, setRoles] = useState<VpRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const rolesData = await vpRolesApi.list();
      setRoles(rolesData);
    } catch (error) {
      console.error('Failed to load VP roles:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const assignedCount = roles.filter(r => r.assignedEmail).length;
  const totalPositions = roles.reduce((sum, r) => sum + r.positionCount, 0);
  const unassignedRoles = roles.filter(r => !r.assignedEmail);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">VP Divisions</h1>
        <p className="text-muted-foreground">
          Overview of organizational divisions and assigned reviewers
        </p>
      </div>

      {/* Warning for unassigned roles */}
      {unassignedRoles.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800">
              <AlertCircle className="h-4 w-4" />
              {unassignedRoles.length} Division{unassignedRoles.length > 1 ? 's' : ''} Without Reviewers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700 mb-3">
              The following divisions don't have assigned reviewers. Go to Users to assign VP reviewers.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {unassignedRoles.map(role => (
                <Badge key={role.id} variant="warning">{role.title}</Badge>
              ))}
            </div>
            <Link to="/users">
              <Button size="sm" variant="outline">Go to Users</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              VP Divisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles.length}</div>
            <p className="text-xs text-muted-foreground">Organizational units</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assigned Reviewers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignedCount} / {roles.length}</div>
            <p className="text-xs text-muted-foreground">
              {roles.length - assignedCount === 0 ? 'All divisions covered' : `${roles.length - assignedCount} need reviewers`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPositions}</div>
            <p className="text-xs text-muted-foreground">Across all divisions</p>
          </CardContent>
        </Card>
      </div>

      {/* VP Roles Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id} className={role.assignedEmail ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50'}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{role.title}</CardTitle>
                  <CardDescription className="font-mono text-xs">{role.code}</CardDescription>
                </div>
                <Badge variant={role.assignedEmail ? 'success' : 'warning'}>
                  {role.assignedEmail ? 'Assigned' : 'Unassigned'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Positions:</span>
                <span className="font-medium">{role.positionCount}</span>
              </div>
              
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Assigned Reviewer:</p>
                {role.assignedEmail ? (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{role.assignedName || 'Name not set'}</p>
                      <p className="text-xs text-muted-foreground">{role.assignedEmail}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-amber-600">
                    No reviewer assigned. <Link to="/users" className="underline">Assign in Users</Link>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
