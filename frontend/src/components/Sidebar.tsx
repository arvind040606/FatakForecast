import React from 'react';
import { 
  Home, 
  GitFork, 
  Clock, 
  Train, 
  Navigation,
  BarChart3, 
  Activity, 
  Bookmark,
  Star,
  Bell,
  Settings,
  ChevronLeft, 
  ChevronRight
} from 'lucide-react';
import { ActiveRoute, OperationalMetrics } from '../types';

interface SidebarProps {
  currentRoute: ActiveRoute;
  onRouteChange: (route: ActiveRoute) => void;
  metrics: OperationalMetrics;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onRouteChange,
  metrics,
  collapsed,
  onToggleCollapse
}) => {
  const navItems = [
    {
      route: '/' as ActiveRoute,
      label: 'Home & Overview',
      icon: Home,
      badge: null
    },
    {
      route: '/planner' as ActiveRoute,
      label: 'Smart Journey',
      icon: Navigation,
      badge: 'Smart',
      badgeColor: 'var(--accent-primary)',
      badgeBg: 'var(--surface-green)'
    },
    {
      route: '/crossings' as ActiveRoute,
      label: 'Crossings & Closures',
      icon: GitFork,
      badge: metrics.closedCount > 0 ? `${metrics.closedCount} Closed` : `${metrics.totalCrossings}`,
      badgeColor: metrics.closedCount > 0 ? 'var(--status-closed)' : undefined,
      badgeBg: metrics.closedCount > 0 ? 'var(--status-closed-bg)' : undefined
    },
    {
      route: '/trains' as ActiveRoute,
      label: 'Train Movements',
      icon: Train,
      badge: `${metrics.activeSectorTrains}`
    },
    {
      route: '/saved-places' as ActiveRoute,
      label: 'Saved Crossings',
      icon: Star,
      badge: null
    },
    {
      route: '/notifications' as ActiveRoute,
      label: 'Notifications',
      icon: Bell,
      badge: null
    },
    {
      route: '/settings' as ActiveRoute,
      label: 'Settings',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <aside style={{
      width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
      backgroundColor: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-panel)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 30,
      userSelect: 'none',
      flexShrink: 0,
      boxShadow: '2px 0 12px rgba(0, 0, 0, 0.3)'
    }}>
      {/* NAVIGATION ITEMS */}
      <div style={{ padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {!collapsed && (
          <div style={{
            padding: '4px 10px 10px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-brand)'
          }}>
            Navigation
          </div>
        )}

        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentRoute === item.route || (item.route === '/crossings' && currentRoute === '/forecasts');

          return (
            <button
              key={item.route}
              onClick={() => onRouteChange(item.route)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'space-between',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isActive ? 'var(--surface-green)' : 'transparent',
                border: isActive ? '1px solid var(--surface-green-border)' : '1px solid transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                width: '100%',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-surface-elevated)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon 
                  size={17} 
                  color={isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'} 
                />
                {!collapsed && (
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: '-0.01em'
                  }}>
                    {item.label}
                  </span>
                )}
              </div>

              {!collapsed && item.badge && (
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: item.badgeBg || 'var(--bg-secondary)',
                  color: item.badgeColor || 'var(--text-secondary)',
                  border: `1px solid ${item.badgeColor ? 'currentColor' : 'var(--border-subtle)'}`
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SIDEBAR FOOTER */}
      <div style={{
        padding: '12px 10px',
        borderTop: '1px solid var(--border-soft)',
        display: 'flex',
        justifyContent: 'center'
      }}>
        <button
          onClick={onToggleCollapse}
          className="btn btn-ghost"
          style={{ width: '100%', padding: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ChevronLeft size={16} />
              <span>Collapse Sidebar</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};
