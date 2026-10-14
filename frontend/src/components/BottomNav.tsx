import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, 
  Navigation, 
  GitFork, 
  Menu,
  Clock, 
  Train, 
  Bookmark, 
  Star,
  Bell, 
  Activity, 
  BarChart3, 
  Settings, 
  X,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

import { ActiveRoute, OperationalMetrics } from '../types';
import { nativeService } from '../services/nativeService';
import { bottomSheetVariants } from '../utils/motion';

interface BottomNavProps {
  currentRoute: ActiveRoute;
  onRouteChange: (route: ActiveRoute) => void;
  metrics: OperationalMetrics;
  onPlayIntro?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentRoute,
  onRouteChange,
  metrics
}) => {
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const handleNav = (route: ActiveRoute) => {
    onRouteChange(route);
    setMoreSheetOpen(false);
    nativeService.triggerHaptic('light');
  };

  // Primary 5 Navigation Tabs for Android Bottom Bar
  const primaryTabs = [
    { 
      route: '/' as ActiveRoute, 
      label: 'Home', 
      icon: Home 
    },
    { 
      route: '/planner' as ActiveRoute, 
      label: 'Planner', 
      icon: Navigation 
    },
    { 
      route: '/crossings' as ActiveRoute, 
      label: 'Fataks', 
      icon: GitFork,
      badge: metrics.closedCount > 0 ? metrics.closedCount : undefined,
      badgeColor: 'var(--status-closed)'
    },
    { 
      route: '/saved-places' as ActiveRoute, 
      label: 'Saved', 
      icon: Star 
    },
    { 
      route: '/settings' as ActiveRoute, 
      label: 'Settings', 
      icon: Settings 
    }
  ];

  interface MoreDestinationItem {
    route: ActiveRoute;
    label: string;
    desc: string;
    icon: any;
    badge?: string;
    badgeColor?: string;
  }

  // Secondary destinations housed in "More"
  const moreDestinations: MoreDestinationItem[] = [
    { 
      route: '/trains' as ActiveRoute, 
      label: 'Train Movements & Schedules', 
      desc: 'Active sector trains, timetables and arrival timelines',
      icon: Train,
      badge: `${metrics.activeSectorTrains}`
    },

    { 
      route: '/saved-places' as ActiveRoute, 
      label: 'Saved Crossings', 
      desc: 'Starred Amritsar railway crossings and closure alerts',
      icon: Star 
    },
    { 
      route: '/notifications' as ActiveRoute, 
      label: 'Notifications', 
      desc: 'Departure reminders and gate alert preferences',
      icon: Bell 
    },
    { 
      route: '/settings' as ActiveRoute, 
      label: 'Settings', 
      desc: 'Travel mode, sound alarms and app preferences',
      icon: Settings 
    }
  ];

  const isMoreActive = moreDestinations.some(d => d.route === currentRoute);

  return (
    <>
      {/* 4-TAB ANDROID BOTTOM NAVIGATION */}
      <nav 
        className="mobile-bottom-nav" 
        role="navigation" 
        aria-label="Main Navigation"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-panel)',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
          paddingBottom: 'max(6px, env(safe-area-inset-bottom, 6px))'
        }}
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentRoute === tab.route;

          return (
            <button
              key={tab.route}
              onClick={() => handleNav(tab.route)}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                flex: 1
              }}
            >
              <div style={{ position: 'relative' }}>
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
                {tab.badge && (
                  <span 
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-8px',
                      background: tab.badgeColor || 'var(--accent-primary)',
                      color: '#fff',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      padding: '1px 5px',
                      lineHeight: '12px'
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="bottom-nav-label" style={{ fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                {tab.label}
              </span>
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: '0px',
                  width: '28px',
                  height: '3px',
                  backgroundColor: 'var(--accent-primary)',
                  borderRadius: '0 0 3px 3px'
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* MORE DESTINATIONS ACTION SHEET */}
      <AnimatePresence>
        {moreSheetOpen && (
          <div 
            className="bottom-sheet-backdrop"
            onClick={() => setMoreSheetOpen(false)}
          >
            <motion.div
              variants={bottomSheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bottom-sheet-content"
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderTop: '1px solid var(--border-panel)',
                boxShadow: 'var(--shadow-sheet)'
              }}
            >
              {/* Grab Handle */}
              <div className="bottom-sheet-handle-bar" />

              {/* Sheet Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SlidersHorizontal size={18} color="var(--accent-primary)" />
                  <h3 style={{ 
                    fontFamily: 'var(--font-brand)', 
                    fontSize: '17px', 
                    fontWeight: 700, 
                    color: 'var(--accent-emphasis)', 
                    margin: 0 
                  }}>
                    More Destinations
                  </h3>
                </div>
                <button
                  onClick={() => setMoreSheetOpen(false)}
                  className="btn btn-ghost"
                  style={{ padding: '6px', borderRadius: '50%', minHeight: '36px' }}
                  aria-label="Close destinations menu"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Sheet Destination Items */}
              <div style={{ 
                padding: '12px 14px', 
                overflowY: 'auto', 
                maxHeight: '65vh', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px' 
              }}>
                {moreDestinations.map(item => {
                  const Icon = item.icon;
                  const isCurrent = currentRoute === item.route;

                  return (
                    <button
                      key={item.route}
                      onClick={() => handleNav(item.route)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: isCurrent ? 'var(--surface-green)' : 'var(--bg-secondary)',
                        border: isCurrent ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                        width: '100%'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          backgroundColor: isCurrent ? 'var(--accent-primary)' : 'var(--surface-green)',
                          color: isCurrent ? 'var(--text-on-accent)' : 'var(--accent-primary)',
                          border: isCurrent ? 'none' : '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Icon size={19} />
                        </div>
                        <div>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: isCurrent ? 700 : 600, 
                            color: isCurrent ? 'var(--accent-emphasis)' : 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            {item.label}
                            {item.badge && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                backgroundColor: item.badgeColor ? 'var(--status-closed-bg)' : 'var(--surface-orange)',
                                color: item.badgeColor || 'var(--accent-tangerine)',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-full)',
                                border: `1px solid ${item.badgeColor ? 'var(--status-closed-border)' : 'var(--surface-orange-border)'}`
                              }}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {item.desc}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={17} color="var(--text-dim)" />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
