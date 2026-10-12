import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrainTrack, ChevronRight } from 'lucide-react';

interface CinematicIntroProps {
  onComplete: () => void;
}

export const CinematicIntro: React.FC<CinematicIntroProps> = ({ onComplete }) => {
  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    // Auto complete after 1.9s
    const timer = setTimeout(() => {
      onComplete();
    }, 1900);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      <motion.div
        className="cinematic-intro-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.35, ease: 'easeInOut' }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          backgroundColor: '#F7F5EF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none'
        }}
      >
        {/* SKIP BUTTON */}
        <motion.button
          onClick={onComplete}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          whileHover={{ opacity: 1, scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={{ delay: 0.2 }}
          style={{
            position: 'absolute',
            top: 'max(20px, env(safe-area-inset-top, 20px))',
            right: 'max(20px, env(safe-area-inset-right, 20px))',
            background: '#FFFFFF',
            border: '1px solid var(--border-soft)',
            color: 'var(--text-secondary)',
            fontSize: '11.5px',
            fontWeight: 600,
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: 'var(--shadow-sm)',
            zIndex: 20
          }}
          aria-label="Skip introduction"
        >
          <span>Skip</span>
          <ChevronRight size={14} />
        </motion.button>

        {/* SUBTLE AMBIENT WARMTH */}
        <div
          style={{
            position: 'absolute',
            width: '420px',
            height: '420px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(23, 107, 77, 0.08) 0%, rgba(255, 120, 73, 0.05) 50%, transparent 70%)',
            filter: 'blur(35px)',
            pointerEvents: 'none'
          }}
        />

        {/* CENTRAL BRAND CONTAINER */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 10 }}>
          {/* LOGO ICON MARK REVEAL */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 22,
              delay: 0.12
            }}
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '18px',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid var(--border-soft)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              marginBottom: '16px'
            }}
          >
            <TrainTrack size={36} color="var(--accent-primary)" />
          </motion.div>

          {/* FATAKFORECAST TITLE */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.35,
              ease: [0.16, 1, 0.3, 1]
            }}
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: '30px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: 'var(--accent-emphasis)'
            }}
          >
            <span>FATAK</span>
            <span style={{ color: 'var(--accent-tangerine)' }}>FORECAST</span>
          </motion.div>

          {/* BRAND TAGLINE */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.6,
              ease: 'easeOut'
            }}
            style={{
              marginTop: '5px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              letterSpacing: '-0.01em'
            }}
          >
            Know Before the Fatak Closes.
          </motion.div>

          {/* PROGRESSIVE RAILWAY TRACK DRAWING */}
          <div style={{ marginTop: '26px', width: '260px', height: '24px', position: 'relative' }}>
            <svg width="260" height="24" viewBox="0 0 260 24" fill="none">
              {/* Upper Rail */}
              <motion.line
                x1="0"
                y1="5"
                x2="260"
                y2="5"
                stroke="var(--accent-primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, delay: 0.7, ease: 'easeInOut' }}
              />

              {/* Lower Rail */}
              <motion.line
                x1="0"
                y1="19"
                x2="260"
                y2="19"
                stroke="var(--accent-primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, delay: 0.75, ease: 'easeInOut' }}
              />

              {/* Sleepers / Cross Ties */}
              {[20, 50, 80, 110, 140, 170, 200, 230].map((x, i) => (
                <motion.line
                  key={x}
                  x1={x}
                  y1="2"
                  x2={x}
                  y2="22"
                  stroke={i % 2 === 0 ? "var(--accent-tangerine)" : "#C8E3D2"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ duration: 0.25, delay: 0.75 + (i * 0.05) }}
                />
              ))}
            </svg>
          </div>

          {/* AMBITIOUS REGIONAL CONTEXT */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.4 }}
            style={{
              marginTop: '16px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}
          >
            Amritsar Railway Intelligence
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
