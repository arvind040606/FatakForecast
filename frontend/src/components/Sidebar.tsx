import React from 'react';
import { 
  LayoutDashboard, 
  Map, 
  GitFork, 
  Clock, 
  Train, 
  BarChart3, 
  Activity, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { ActiveView, OperationalMetrics } from '../types';

interface SidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  metrics: OperationalMetrics;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  metrics,
  collapsed,
  onToggleCollapse
}) => {
  const navItems = [
    {
      id: 'overview' as ActiveView,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'map' as ActiveView,
      label: 'Live Railway Map',
      icon: Map,
      badge: 'LIVE'
    },
    {
      id: 'crossings' as ActiveView,
      label: 'All Crossings',
      icon: GitFork,
      badge: `${metrics.totalCrossings}`
    },
    {
      id: 'upcoming' as ActiveView,
      label: 'Upcoming Closures',
      icon: Clock,
      badge: metrics.closedCount > 0 || metrics.approachingCount > 0 
        ? `${metrics.closedCount + metrics.approachingCount}` 
        : null,
      badgeColor: metrics.closedCount > 0 ? 'var(--status-closed)' : 'var(--status-approaching)'
    },
    {
      id: 'trains' as ActiveView,
      label: 'Train Movements',
      icon: Train,
      badge: `${metrics.activeSectorTrains}`
    },
    {
      id: 'analytics' as ActiveView,
      label: 'Forecast Analytics',
      icon: BarChart3,
      badge: null
    },
    {
      id: 'health' as ActiveView,
      label: 'Data Health',
      icon: Activity,
      badge: 'OK',
      badgeColor: 'var(--status-open)'
    }
  ];

  return (
    <aside style={{
      width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
      backgroundColor: 'var(--bg-secondary)',
      borderRight: '1px solid var(--bg-panel-border)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 40,
      userSelect: 'none'
    }}>
      {/* NAVIGATION LIST */}
      <div style={{ padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{
          padding: '0 8px 8px 8px',
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          display: collapsed ? 'none' : 'block'
        }}>
          Operations Deck
        </div>

        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'space-between',
                padding: '10px 12px',
                borderRadius: '6px',
                background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                border: isActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                color: isActive ? 'var(--text-white)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                width: '100%',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Icon 
                  size={18} 
                  color={isActive ? 'var(--accent-cyan)' : 'currentColor'} 
                />
                {!collapsed && (
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: '-0.01em'
                  }}>
                    {item.label}
                  </span>
                )}
              </div>

              {!collapsed && item.badge && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  backgroundColor: item.badgeColor ? `${item.badgeColor}22` : 'rgba(56, 189, 248, 0.15)',
                  color: item.badgeColor || 'var(--accent-cyan)',
                  border: `1px solid ${item.badgeColor || 'rgba(56, 189, 248, 0.3)'}`
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* FOOTER & COLLAPSE TOGGLE */}
      <div style={{
        padding: '14px 10px',
        borderTop: '1px solid var(--bg-panel-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {!collapsed && (
          <div style={{
            background: 'rgba(17, 26, 48, 0.5)',
            border: '1px solid var(--bg-panel-border)',
            borderRadius: '6px',
            padding: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldCheck size={18} color="var(--status-open)" />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Firozpur Division
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                Certified Northern Railway Sector
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px',
            background: 'transparent',
            border: '1px solid var(--bg-panel-border)',
            borderRadius: '6px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '11px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--bg-panel-border)';
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : (
            <>
              <ChevronLeft size={16} />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
