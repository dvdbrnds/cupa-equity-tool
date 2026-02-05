import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { usersApi, vpRolesApi } from '@/services/api';
import type { User, PaginatedResponse, VpRole } from '@cupa/shared';
import { USER_ROLES } from '@cupa/shared';
import { debounce } from '@/lib/utils';

export function UsersPage() {
  const [users, setUsers] = useState<PaginatedResponse<User> | null>(null);
  const [vpRoles, setVpRoles] = useState<VpRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    role: '',
    vpRoleId: '',
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        usersApi.list({ search: search || undefined, limit: 50 }),
        vpRolesApi.list(),
      ]);
      setUsers(usersData);
      setVpRoles(rolesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const debouncedSetSearch = useCallback(
    debounce((value: string) => setSearch(value), 300),
    []
  );

  // Find which VP role a user is assigned to (by matching email)
  function getUserVpRole(user: User): VpRole | undefined {
    return vpRoles.find(r => r.assignedEmail?.toLowerCase() === user.email.toLowerCase());
  }

  async function handleCreate() {
    setCreateError('');
    
    if (!newUser.name.trim()) {
      setCreateError('Name is required');
      return;
    }
    if (!newUser.email.trim()) {
      setCreateError('Email is required');
      return;
    }
    if (!newUser.password || newUser.password.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }
    if (!newUser.role) {
      setCreateError('Role is required');
      return;
    }
    
    setIsCreating(true);
    try {
      await usersApi.create({
        email: newUser.email,
        password: newUser.password,
        name: newUser.name,
        role: newUser.role,
      });
      
      // If VP role selected, assign this user's email to that role
      if (newUser.vpRoleId) {
        await vpRolesApi.assign(parseInt(newUser.vpRoleId), newUser.email, newUser.name);
      }
      
      setShowCreateDialog(false);
      setNewUser({ email: '', password: '', name: '', role: '', vpRoleId: '' });
      loadData();
    } catch (error: any) {
      setCreateError(error.message || 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleActive(user: User) {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      loadData();
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  }

  async function handleVpRoleChange(user: User, vpRoleId: string) {
    try {
      // Clear old assignment if user was assigned to a different role
      const oldRole = getUserVpRole(user);
      if (oldRole && oldRole.id.toString() !== vpRoleId) {
        await vpRolesApi.assign(oldRole.id, null, null);
      }
      
      // Set new assignment (this will also clear any existing assignment on that role)
      if (vpRoleId && vpRoleId !== 'none') {
        await vpRolesApi.assign(parseInt(vpRoleId), user.email, user.name);
      }
      
      loadData();
    } catch (error: any) {
      // If error is about reassignment, the backend should handle it
      console.error('Failed to update VP role:', error);
      alert(error.message || 'Failed to update VP role');
    }
  }

  // Get all VP roles, marking which ones are taken
  function getVpRolesForDropdown(currentUser?: User): Array<VpRole & { isTaken: boolean }> {
    return vpRoles.map(r => ({
      ...r,
      isTaken: !!(r.assignedEmail && 
        (!currentUser || r.assignedEmail.toLowerCase() !== currentUser.email.toLowerCase()))
    }));
  }

  const needsVpRole = (role: string) => ['vp_reviewer', 'academic_dean'].includes(role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage all user accounts - HR staff and VP reviewers
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (open) setCreateError(''); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>Add a new user to the system</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v, vpRoleId: '' })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(USER_ROLES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {needsVpRole(newUser.role) && (
                <div>
                  <Label>VP Division</Label>
                  <Select value={newUser.vpRoleId || 'none'} onValueChange={(v) => setNewUser({ ...newUser, vpRoleId: v === 'none' ? '' : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select VP division" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Select Division --</SelectItem>
                      {getVpRolesForDropdown().map((role) => (
                        <SelectItem key={role.id} value={role.id.toString()}>
                          {role.title} ({role.positionCount} positions)
                          {role.isTaken && role.assignedName ? ` - ${role.assignedName}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecting a division already assigned will reassign it to this user.
                  </p>
                </div>
              )}
            </div>
            {createError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
                {createError}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-10"
                onChange={(e) => debouncedSetSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : users?.data.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No users found</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">Email</th>
                  <th className="text-left py-3 px-4 font-medium">Role</th>
                  <th className="text-left py-3 px-4 font-medium">VP Division</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users?.data.map((user) => {
                  const userVpRole = getUserVpRole(user);
                  return (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{user.name}</td>
                      <td className="py-3 px-4">{user.email}</td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">
                          {USER_ROLES[user.role]?.label || user.role}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {needsVpRole(user.role) ? (
                          <Select 
                            value={userVpRole?.id.toString() || 'none'} 
                            onValueChange={(v) => handleVpRoleChange(user, v === 'none' ? '' : v)}
                          >
                            <SelectTrigger className="w-[220px]">
                              <SelectValue placeholder="Select division" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- None --</SelectItem>
                              {getVpRolesForDropdown(user).map((role) => (
                                <SelectItem key={role.id} value={role.id.toString()}>
                                  {role.title}
                                  {role.isTaken ? ` (${role.assignedName || 'taken'})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={user.isActive ? 'success' : 'gray'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                              {user.isActive ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
