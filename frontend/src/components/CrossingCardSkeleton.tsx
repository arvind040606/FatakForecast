import React from 'react';

/**
 * CrossingCardSkeleton — Placeholder skeleton card matching exact dimensions (minHeight: 248px),
 * padding, and layout of CrossingCard to guarantee zero Cumulative Layout Shift (CLS) during data loading.
 */
export const CrossingCardSkeleton: React.FC = () => {
  return (
    <div
      className="mobile-card"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-panel)',
        borderLeft: '4px solid var(--border-subtle)',
        padding: '16px 18px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '12px',
        minHeight: '248px',
        boxSizing: 'border-box'
      }}
      aria-hidden="true"
    >
      {/* 1. Header Skeleton */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div className="skeleton-box" style={{ width: '80px', height: '14px', borderRadius: '4px' }} />
            <div className="skeleton-box" style={{ width: '50px', height: '12px', borderRadius: '4px' }} />
          </div>
          <div className="skeleton-box" style={{ width: '75%', height: '18px', borderRadius: '4px', marginBottom: '6px' }} />
          <div className="skeleton-box" style={{ width: '50%', height: '13px', borderRadius: '4px' }} />
        </div>
        <div className="skeleton-box" style={{ width: '64px', height: '22px', borderRadius: 'var(--radius-full)' }} />
      </div>

      {/* 2. Timing Status Banner Skeleton */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div className="skeleton-box" style={{ width: '100px', height: '12px', borderRadius: '3px' }} />
          <div className="skeleton-box" style={{ width: '70px', height: '12px', borderRadius: '3px' }} />
        </div>
        <div className="skeleton-box" style={{ width: '55%', height: '22px', borderRadius: '4px', marginBottom: '6px' }} />
        <div className="skeleton-box" style={{ width: '85%', height: '12px', borderRadius: '3px' }} />
      </div>

      {/* 3. Train Corridor Context Skeleton */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div className="skeleton-box" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
        <div className="skeleton-box" style={{ width: '65%', height: '13px', borderRadius: '3px' }} />
      </div>

      {/* 4. Footer Actions Skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px' }}>
        <div className="skeleton-box" style={{ width: '80px', height: '14px', borderRadius: '4px' }} />
        <div className="skeleton-box" style={{ width: '95px', height: '32px', borderRadius: 'var(--radius-sm)' }} />
      </div>
    </div>
  );
};

export default CrossingCardSkeleton;
