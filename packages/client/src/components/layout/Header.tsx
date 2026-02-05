import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { USER_ROLES } from '@cupa/shared';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleLabel = user?.role ? USER_ROLES[user.role]?.label : 'User';

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div>
        {user?.division && (
          <Badge variant="secondary" className="text-xs">
            {user.division}
          </Badge>
        )}
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
