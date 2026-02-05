import { NavLink } from 'react-router-dom';
import {
  Users,
  FileText,
  History,
  Upload,
  BookOpen,
  Building2,
  DollarSign,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const navItems: NavItem[] = [
  {
    label: 'Equity Dashboard',
    href: '/',
    icon: DollarSign,
  },
  {
    label: 'Positions',
    href: '/positions',
    icon: FileText,
  },
  {
    label: 'CUPA Catalog',
    href: '/cupa-catalog',
    icon: BookOpen,
  },
  {
    label: 'Review History',
    href: '/history',
    icon: History,
  },
  {
    label: 'Review Cycles',
    href: '/review-cycles',
    icon: ClipboardList,
    roles: ['system_admin', 'hr_admin'],
  },
  {
    label: 'Import Data',
    href: '/import',
    icon: Upload,
    roles: ['system_admin', 'hr_admin'],
  },
  {
    label: 'Users',
    href: '/users',
    icon: Users,
    roles: ['system_admin'],
  },
  {
    label: 'VP Divisions',
    href: '/vp-roles',
    icon: Building2,
    roles: ['system_admin', 'hr_admin'],
  },
];

export function Sidebar() {
  const { user } = useAuth();

  const filteredNavItems = navItems.filter(item => {
    if (item.roles) {
      return user && item.roles.includes(user.role);
    }
    return true;
  });

  return (
    <aside className="hidden w-64 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-lg font-semibold text-primary">CUPA Tool</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {filteredNavItems.map(item => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground">
          <p>Moravian University</p>
          <p>HR Compensation Tools</p>
        </div>
      </div>
    </aside>
  );
}
