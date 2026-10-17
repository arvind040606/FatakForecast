import React from 'react';

/**
 * TrainCardSkeleton — Shimmer skeleton matching the exact geometry, padding,
 * and layout of train cards in TrainMovementsView to prevent CLS.
 */
export const TrainCardSkeleton: React.FC = () => {
  return (
    <div
      className="mobile-card"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderLeft: '4px solid var(--border-subtle)',
        padding: '18px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxSizing: 'border-box'
      }}
      aria-hidden="true"
    >
      {/* 1. Header Skeleton */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
          <div className="skeleton-box" style={{ width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <div className="skeleton-box" style={{ width: '130px', height: '16px', borderRadius: '4px' }} />
              <div className="skeleton-box" style={{ width: '55px', height: '14px', borderRadius: 'var(--radius-full)' }} />
            </div>
            <div className="skeleton-box" style={{ width: '90px', height: '12px', borderRadius: '3px' }} />
          </div>
        </div>
        <div className="skeleton-box" style={{ width: '70px', height: '22px', borderRadius: 'var(--radius-full)' }} />
      </div>

      {/* 2. Metrics Strip Skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        backgroundColor: 'var(--bg-secondary)',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div>
          <div className="skeleton-box" style={{ width: '40px', height: '10px', borderRadius: '2px', marginBottom: '4px' }} />
          <div className="skeleton-box" style={{ width: '60px', height: '16px', borderRadius: '3px' }} />
        </div>
        <div>
          <div className="skeleton-box" style={{ width: '40px', height: '10px', borderRadius: '2px', marginBottom: '4px' }} />
          <div className="skeleton-box" style={{ width: '70px', height: '16px', borderRadius: '3px' }} />
        </div>
        <div>
          <div className="skeleton-box" style={{ width: '45px', height: '10px', borderRadius: '2px', marginBottom: '4px' }} />
          <div className="skeleton-box" style={{ width: '55px', height: '16px', borderRadius: '3px' }} />
        </div>
      </div>

      {/* 3. Footer Action Skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
        <div className="skeleton-box" style={{ width: '120px', height: '12px', borderRadius: '3px' }} />
        <div className="skeleton-box" style={{ width: '85px', height: '32px', borderRadius: 'var(--radius-sm)' }} />
      </div>
    </div>
  );
};

export default TrainCardSkeleton;
