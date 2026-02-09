import { NavLink } from 'react-router-dom';
import {
  Users,
  FileText,
  History,
  BookOpen,
  Building2,
  DollarSign,
  ClipboardList,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  roles?: string[];
}

export function Sidebar() {
  const { user } = useAuth();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    Setup: true,
  });

  const isInstitutionWide = user && INSTITUTION_WIDE_ROLES.includes(user.role);

  const navGroups: NavGroup[] = isInstitutionWide
    ? [
        {
          label: 'Analysis',
          items: [
            { label: 'Dashboard', href: '/', icon: DollarSign },
            { label: 'Positions', href: '/positions', icon: FileText },
            { label: 'CUPA Catalog', href: '/cupa-catalog', icon: BookOpen },
          ],
        },
        {
          label: 'Review',
          items: [
            {
              label: 'Review Cycles',
              href: '/review-cycles',
              icon: ClipboardList,
              roles: ['system_admin', 'hr_admin'],
            },
            { label: 'Review History', href: '/history', icon: History },
          ],
        },
        {
          label: 'Setup',
          collapsible: true,
          defaultCollapsed: true,
          roles: ['system_admin', 'hr_admin'],
          items: [
            {
              label: 'VP Divisions',
              href: '/vp-roles',
              icon: Building2,
              roles: ['system_admin', 'hr_admin'],
            },
            {
              label: 'Users',
              href: '/users',
              icon: Users,
              roles: ['system_admin'],
            },
          ],
        },
      ]
    : [
        // VP / Division-scoped users
        {
          label: '',
          items: [
            { label: 'Dashboard', href: '/', icon: DollarSign },
            { label: 'My Review', href: '/review', icon: ClipboardList },
            { label: 'Positions', href: '/positions', icon: FileText },
          ],
        },
      ];

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function filterItems(items: NavItem[]): NavItem[] {
    return items.filter((item) => {
      if (item.roles) {
        return user && item.roles.includes(user.role);
      }
      return true;
    });
  }

  function filterGroups(groups: NavGroup[]): NavGroup[] {
    return groups
      .filter((group) => {
        if (group.roles) {
          return user && group.roles.includes(user.role);
        }
        return true;
      })
      .map((group) => ({
        ...group,
        items: filterItems(group.items),
      }))
      .filter((group) => group.items.length > 0);
  }

  const visibleGroups = filterGroups(navGroups);

  return (
    <aside className="hidden w-64 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-lg font-semibold text-primary">CUPA Tool</h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {visibleGroups.map((group) => {
          const isCollapsed =
            group.collapsible && (collapsedGroups[group.label] ?? group.defaultCollapsed);

          return (
            <div key={group.label || 'default'}>
              {group.label && (
                <button
                  onClick={() => group.collapsible && toggleGroup(group.label)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 mb-2',
                    group.collapsible
                      ? 'cursor-pointer hover:text-foreground'
                      : 'cursor-default'
                  )}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                  {group.collapsible &&
                    (isCollapsed ? (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ))}
                </button>
              )}
              {!isCollapsed && (
                <div className="space-y-1">
                  {group.items.map((item) => (
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
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
