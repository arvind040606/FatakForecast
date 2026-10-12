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

  // Primary 3 Navigation Tabs + More for Android Bottom Bar
  const primaryTabs = [
    { 
      route: '/' as ActiveRoute, 
      label: 'Home', 
      icon: Home 
    },
    { 
      route: '/planner' as ActiveRoute, 
      label: 'Journey', 
      icon: Navigation 
    },
    { 
      route: '/crossings' as ActiveRoute, 
      label: 'Crossings', 
      icon: GitFork,
      badge: metrics.closedCount > 0 ? metrics.closedCount : undefined,
      badgeColor: 'var(--status-closed)'
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
      label: 'Saved Places', 
      desc: 'Home, work and frequent Amritsar commuter stops',
      icon: Bookmark 
    },
    { 
      route: '/notifications' as ActiveRoute, 
      label: 'Notifications', 
      desc: 'Departure reminders and gate alert preferences',
      icon: Bell 
    },
    { 
      route: '/analytics' as ActiveRoute, 
      label: 'Forecast Analytics', 
      desc: 'Historical crossing wait times and reliability',
      icon: BarChart3 
    },
    { 
      route: '/data-health' as ActiveRoute, 
      label: 'Data Health & Telemetry', 
      desc: 'RailKit SDK, OpenStreetMap and feed status diagnostics',
      icon: Activity 
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
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid var(--border-soft)',
          boxShadow: '0 -4px 16px rgba(36, 40, 36, 0.05)'
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
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'
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
                      background: tab.badgeColor || 'var(--accent-tangerine)',
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
              <span className="bottom-nav-label" style={{ fontWeight: isActive ? 700 : 500 }}>
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

        {/* 4th TAB: MORE */}
        <button
          onClick={() => {
            setMoreSheetOpen(!moreSheetOpen);
            nativeService.triggerHaptic('light');
          }}
          className={`bottom-nav-item ${isMoreActive || moreSheetOpen ? 'active' : ''}`}
          aria-expanded={moreSheetOpen}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            color: isMoreActive || moreSheetOpen ? 'var(--accent-primary)' : 'var(--text-secondary)'
          }}
        >
          <Menu size={20} strokeWidth={isMoreActive || moreSheetOpen ? 2.4 : 1.8} />
          <span className="bottom-nav-label" style={{ fontWeight: isMoreActive || moreSheetOpen ? 700 : 500 }}>
            More
          </span>
          {(isMoreActive || moreSheetOpen) && (
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
                backgroundColor: '#FFFFFF',
                borderTop: '1px solid var(--border-soft)',
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
                        background: isCurrent ? 'var(--surface-green)' : '#FAF9F5',
                        border: isCurrent ? '1.5px solid var(--surface-green-border)' : '1px solid var(--border-subtle)',
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
                          backgroundColor: isCurrent ? 'var(--accent-primary)' : '#FFFFFF',
                          color: isCurrent ? '#FFFFFF' : 'var(--accent-primary)',
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
