import { useEffect, useState } from 'react';
import { Building2, Users, User, AlertCircle, Pencil, Check, X, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { vpRolesApi } from '@/services/api';
import type { VpRole } from '@cupa/shared';
import { useAuth } from '@/context/AuthContext';
import { USER_MANAGEMENT_ROLES } from '@cupa/shared';

function DivisionCard({
  role,
  canManage,
  onUpdated,
}: {
  role: VpRole;
  canManage: boolean;
  onUpdated: (updated: VpRole) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [emailInput, setEmailInput] = useState(role.assignedEmail ?? '');
  const [nameInput, setNameInput] = useState(role.assignedName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setEmailInput(role.assignedEmail ?? '');
    setNameInput(role.assignedName ?? '');
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const email = emailInput.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const name = nameInput.trim() || null;
      const updated = await vpRolesApi.assign(role.id, email, name);
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function clearAssignment() {
    setSaving(true);
    setError(null);
    try {
      const updated = await vpRolesApi.assign(role.id, null, null);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear');
    } finally {
      setSaving(false);
    }
  }

  const isAssigned = !!role.assignedEmail;

  return (
    <Card className={isAssigned ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg leading-tight">{role.title}</CardTitle>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{role.code}</p>
          </div>
          <Badge variant={isAssigned ? 'success' : 'warning'} className="shrink-0">
            {isAssigned ? 'Assigned' : 'Unassigned'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Positions covered:</span>
          <span className="font-semibold">{role.positionCount}</span>
        </div>

        <div className="border-t pt-3">
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`email-${role.id}`} className="text-xs">
                  Reviewer Email (Okta login email)
                </Label>
                <Input
                  id={`email-${role.id}`}
                  type="email"
                  placeholder="vp@moravian.edu"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  autoFocus
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`name-${role.id}`} className="text-xs">
                  Display Name (optional)
                </Label>
                <Input
                  id={`name-${role.id}`}
                  type="text"
                  placeholder="Dr. Jane Smith"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  className="h-8 text-sm"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving}
                  className="h-7 px-3 text-xs"
                >
                  {saving ? <LoadingSpinner size="sm" /> : <Check className="h-3 w-3 mr-1" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="h-7 px-3 text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {isAssigned ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {role.assignedName || 'Name not set'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{role.assignedEmail}</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={startEdit}
                        className="h-7 w-7 p-0"
                        title="Change reviewer"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearAssignment}
                        disabled={saving}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Remove reviewer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-amber-600">No reviewer assigned</p>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startEdit}
                      className="h-7 px-3 text-xs"
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Assign
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function VpRolesPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<VpRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const canManage = user ? USER_MANAGEMENT_ROLES.includes(user.role) : false;

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

  async function syncRoles() {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const result = await vpRolesApi.sync();
      setSyncMessage(`Synced — ${result.created} created, ${result.updated} updated`);
      await loadData();
    } catch {
      setSyncMessage('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  function handleRoleUpdated(updated: VpRole) {
    setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  const assignedCount = roles.filter((r) => r.assignedEmail).length;
  const totalPositions = roles.reduce((sum, r) => sum + r.positionCount, 0);
  const unassignedCount = roles.length - assignedCount;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">VP Divisions</h1>
          <p className="text-muted-foreground mt-1">
            Assign a reviewer email to each division. When that person logs in via Okta, they'll
            see only their division's positions.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={syncRoles}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync from Positions
            </Button>
            {syncMessage && (
              <p className="text-xs text-muted-foreground">{syncMessage}</p>
            )}
          </div>
        )}
      </div>

      {/* Warning banner */}
      {unassignedCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {unassignedCount} division{unassignedCount > 1 ? 's have' : ' has'} no reviewer
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {canManage
                ? 'Click "Assign" on any card below to add a reviewer email.'
                : 'Contact an HR admin to assign reviewers.'}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Divisions
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
              Reviewers Assigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {assignedCount}
              <span className="text-sm font-normal text-muted-foreground"> / {roles.length}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {unassignedCount === 0 ? 'All divisions covered' : `${unassignedCount} still need reviewers`}
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

      {/* Division cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <DivisionCard
            key={role.id}
            role={role}
            canManage={canManage}
            onUpdated={handleRoleUpdated}
          />
        ))}
      </div>

      {roles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No divisions found</p>
          {canManage && (
            <p className="text-sm mt-1">
              Click "Sync from Positions" to import divisions from your position data.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
