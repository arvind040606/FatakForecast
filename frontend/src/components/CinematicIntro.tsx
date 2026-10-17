import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Volume2, VolumeX } from 'lucide-react';

interface CinematicIntroProps {
  onComplete: () => void;
  isDataReady?: boolean;
}

export const CinematicIntro: React.FC<CinematicIntroProps> = ({ onComplete, isDataReady }) => {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [hasStartedExit, setHasStartedExit] = useState<boolean>(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState<boolean>(false);
  const [statusStage, setStatusStage] = useState<number>(0);

  useEffect(() => {
    // Stage 1 -> Stage 2 -> Stage 3 status ticker
    const s1 = setTimeout(() => setStatusStage(1), 1200);
    const s2 = setTimeout(() => setStatusStage(2), 2200);

    // Minimum display duration: 2.8s for smooth branded experience
    const minTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2800);

    // Failsafe maximum timer: enter application within 4.8s regardless of network
    const failsafeTimer = setTimeout(() => {
      triggerExit();
    }, 4800);

    return () => {
      clearTimeout(s1);
      clearTimeout(s2);
      clearTimeout(minTimer);
      clearTimeout(failsafeTimer);
    };
  }, []);

  useEffect(() => {
    if (minTimeElapsed && isDataReady) {
      triggerExit();
    }
  }, [minTimeElapsed, isDataReady]);

  const triggerExit = () => {
    if (hasStartedExit) return;
    setHasStartedExit(true);
    setTimeout(() => {
      onComplete();
    }, 450);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="cinematic-intro-stage"
        initial={{ opacity: 0 }}
        animate={{ opacity: hasStartedExit ? 0 : 1 }}
        exit={{ opacity: 0, scale: 1.03 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          backgroundColor: '#070E1A',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none',
          fontFamily: 'var(--font-brand, "Outfit", sans-serif)'
        }}
      >
        {/* TOP CONTROLS BAR: SKIP & AUDIO TOGGLE */}
        <div style={{
          position: 'absolute',
          top: 'max(20px, env(safe-area-inset-top, 20px))',
          left: 'max(20px, env(safe-area-inset-left, 20px))',
          right: 'max(20px, env(safe-area-inset-right, 20px))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 50
        }}>
          {/* REGIONAL BADGE */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontSize: '10.5px',
              letterSpacing: '0.06em',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#00E5FF'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00E5FF', boxShadow: '0 0 8px #00E5FF' }} />
            <span>Amritsar Railway Sector</span>
          </motion.div>

          {/* SKIP BUTTON */}
          <motion.button
            onClick={triggerExit}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.18)' }}
            whileTap={{ scale: 0.95 }}
            transition={{ delay: 0.2 }}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              backdropFilter: 'blur(8px)',
              color: '#FFFFFF',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: '24px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              outline: 'none',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
            }}
            aria-label="Skip intro"
          >
            <span>Skip</span>
            <ChevronRight size={13} />
          </motion.button>
        </div>

        {/* CINEMATIC SVG CANVAS (SCENE: TRACKS, TRAIN HEADLIGHTS, WARNING LIGHTS, LOWERING BARRIER) */}
        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: '540px',
          height: '280px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <svg 
            width="100%" 
            height="100%" 
            viewBox="0 0 500 280" 
            fill="none" 
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Electric Cyan Glow Filter */}
              <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              {/* Red Flasher Glow Filter */}
              <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              {/* Headlight Beam Linear Gradient */}
              <linearGradient id="headlightBeam" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
                <stop offset="40%" stopColor="#FFF2A3" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.0" />
              </linearGradient>
              {/* Barrier Stripes Pattern */}
              <pattern id="barrierStripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="10" height="20" fill="#E53935" />
                <rect x="10" width="10" height="20" fill="#FFFFFF" />
              </pattern>
            </defs>

            {/* 1. PERSPECTIVE RAILWAY TRACKS (Converging to Center 250, 95) */}
            {/* Ground Bed */}
            <motion.polygon
              points="242,95 258,95 380,265 120,265"
              fill="rgba(11, 25, 48, 0.4)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            />

            {/* Sleepers / Cross Ties in perspective */}
            {[
              { y: 110, w: 28 },
              { y: 125, w: 42 },
              { y: 145, w: 64 },
              { y: 170, w: 96 },
              { y: 200, w: 140 },
              { y: 235, w: 200 }
            ].map((tie, idx) => (
              <motion.line
                key={idx}
                x1={250 - tie.w / 2}
                y1={tie.y}
                x2={250 + tie.w / 2}
                y2={tie.y}
                stroke="#1B3358"
                strokeWidth={3 + idx * 0.8}
                strokeLinecap="round"
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 0.9, scaleX: 1 }}
                transition={{ delay: 0.15 + idx * 0.08, duration: 0.3 }}
              />
            ))}

            {/* Left Electric Rail */}
            <motion.line
              x1="244"
              y1="95"
              x2="140"
              y2="265"
              stroke="#00E5FF"
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#cyanGlow)"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />

            {/* Right Electric Rail */}
            <motion.line
              x1="256"
              y1="95"
              x2="360"
              y2="265"
              stroke="#00E5FF"
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#cyanGlow)"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />

            {/* Center Track Power/Signal Line */}
            <motion.line
              x1="250"
              y1="95"
              x2="250"
              y2="265"
              stroke="#007799"
              strokeWidth="1.2"
              strokeDasharray="4 6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            />

            {/* 2. APPROACHING TRAIN & POWERFUL HEADLIGHT BEAMS */}
            <g>
              {/* Left Headlight Light Cone */}
              <motion.polygon
                points="242,94 170,250 240,250"
                fill="url(#headlightBeam)"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ 
                  opacity: [0, 0.4, 0.7, 0.5],
                  scale: [0.3, 0.7, 1.1, 1]
                }}
                transition={{ delay: 0.5, duration: 1.6, ease: 'easeOut' }}
              />
              {/* Right Headlight Light Cone */}
              <motion.polygon
                points="258,94 260,250 330,250"
                fill="url(#headlightBeam)"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ 
                  opacity: [0, 0.4, 0.7, 0.5],
                  scale: [0.3, 0.7, 1.1, 1]
                }}
                transition={{ delay: 0.5, duration: 1.6, ease: 'easeOut' }}
              />

              {/* Train Locomotive Front Silhouette */}
              <motion.path
                d="M236,75 Q250,70 264,75 L267,98 Q250,102 233,98 Z"
                fill="#0F223D"
                stroke="#00E5FF"
                strokeWidth="1.5"
                initial={{ scale: 0.4, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              />

              {/* Windshield */}
              <motion.path
                d="M238,78 L262,78 L260,86 L240,86 Z"
                fill="#16395A"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.9 }}
                transition={{ delay: 0.7 }}
              />

              {/* Left Headlamp (Bright Glow) */}
              <motion.circle
                cx="241"
                cy="92"
                r="3.5"
                fill="#FFFFFF"
                initial={{ scale: 0 }}
                animate={{ 
                  scale: [0, 1.8, 1.4],
                  boxShadow: '0 0 16px #FFFFFF'
                }}
                transition={{ delay: 0.55, duration: 0.8 }}
              />
              {/* Right Headlamp (Bright Glow) */}
              <motion.circle
                cx="259"
                cy="92"
                r="3.5"
                fill="#FFFFFF"
                initial={{ scale: 0 }}
                animate={{ 
                  scale: [0, 1.8, 1.4]
                }}
                transition={{ delay: 0.55, duration: 0.8 }}
              />
            </g>

            {/* 3. LEVEL CROSSING SIGNAL POST & WIG-WAG FLASHING LIGHTS */}
            <g id="crossingSignalPost">
              {/* Mast Pole (Right side 395, 110) */}
              <line x1="400" y1="90" x2="400" y2="230" stroke="#8A99AD" strokeWidth="4" strokeLinecap="round" />
              <rect x="390" y="226" width="20" height="6" rx="2" fill="#5A6878" />

              {/* Crossbuck "X" Sign (Railway Crossing) */}
              <line x1="388" y1="96" x2="412" y2="120" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
              <line x1="412" y1="96" x2="388" y2="120" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />

              {/* Flasher Crossbar */}
              <line x1="378" y1="134" x2="422" y2="134" stroke="#485566" strokeWidth="3" />

              {/* Left Flasher Lamp */}
              <circle cx="380" cy="134" r="7" fill="#1C2430" stroke="#3A4656" strokeWidth="1.5" />
              <motion.circle
                cx="380"
                cy="134"
                r="5"
                fill="#FF3B30"
                filter="url(#redGlow)"
                animate={{ 
                  opacity: [1, 0.15, 1, 0.15, 1],
                  scale: [1.2, 0.8, 1.2, 0.8, 1.2]
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 0.9, 
                  ease: 'easeInOut' 
                }}
              />

              {/* Right Flasher Lamp (Alternates with Left) */}
              <circle cx="420" cy="134" r="7" fill="#1C2430" stroke="#3A4656" strokeWidth="1.5" />
              <motion.circle
                cx="420"
                cy="134"
                r="5"
                fill="#FF3B30"
                filter="url(#redGlow)"
                animate={{ 
                  opacity: [0.15, 1, 0.15, 1, 0.15],
                  scale: [0.8, 1.2, 0.8, 1.2, 0.8]
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 0.9, 
                  ease: 'easeInOut' 
                }}
              />
            </g>

            {/* 4. ANIMATED LOWERING CROSSING BOOM BARRIER */}
            {/* Barrier Gate Pivot Stanchion (Left side 95, 190) */}
            <g id="barrierGatePivot">
              <rect x="88" y="170" width="14" height="60" rx="3" fill="#3D4B5C" stroke="#222B38" strokeWidth="1.5" />
              <circle cx="95" cy="180" r="6" fill="#FF7849" />
              <circle cx="95" cy="180" r="2.5" fill="#FFFFFF" />
            </g>

            {/* Animated Rotating Boom Barrier Arm */}
            {/* Starts raised at -60 deg, rotates down to horizontal 0 deg */}
            <motion.g
              initial={{ rotate: -55 }}
              animate={{ rotate: 0 }}
              transition={{ 
                delay: 1.1, 
                duration: 1.1, 
                ease: [0.25, 1, 0.5, 1] 
              }}
              style={{ originX: '95px', originY: '180px' }}
            >
              {/* Barrier Arm Body */}
              <rect
                x="95"
                y="175"
                width="280"
                height="10"
                rx="3"
                fill="url(#barrierStripes)"
                stroke="#B71C1C"
                strokeWidth="1.2"
                style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))' }}
              />
              {/* Barrier Tip Red LED Warning Marker */}
              <circle cx="372" cy="180" r="3" fill="#FF3B30" filter="url(#redGlow)" />
            </motion.g>
          </svg>
        </div>

        {/* 5. BRAND EMBLEM & TAGLINE REVEAL */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '10px',
          zIndex: 40,
          textAlign: 'center',
          padding: '0 20px'
        }}>
          {/* LOGO TITLE */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 1.8,
              duration: 0.65,
              ease: [0.16, 1, 0.3, 1]
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '32px',
              fontWeight: 800,
              letterSpacing: '0.04em'
            }}
          >
            <span style={{ color: '#FFFFFF', textShadow: '0 0 20px rgba(0, 229, 255, 0.35)' }}>
              FATAK
            </span>
            <span style={{ color: '#FF7849', textShadow: '0 0 20px rgba(255, 120, 73, 0.4)' }}>
              FORECAST
            </span>
          </motion.div>

          {/* SIGNATURE TAGLINE */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 2.1,
              duration: 0.55,
              ease: 'easeOut'
            }}
            style={{
              marginTop: '6px',
              fontSize: '15px',
              fontWeight: 500,
              color: '#A0B2C6',
              letterSpacing: '0.01em'
            }}
          >
            Know Before the Fatak Closes.
          </motion.div>

          {/* GLOWING DIVIDER LINE */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 2.3, duration: 0.7, ease: 'easeInOut' }}
            style={{
              marginTop: '18px',
              width: '180px',
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #00E5FF, #FF7849, transparent)'
            }}
          />

          {/* ENTERING PLATFORM STATUS SUBTITLE */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            style={{
              marginTop: '14px',
              fontSize: '11px',
              fontWeight: 600,
              color: isDataReady ? '#10B981' : '#64748B',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px'
            }}
          >
            {isDataReady ? (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', boxShadow: '0 0 6px #10B981' }} />
            ) : (
              <span className="loading-spinner-ring" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} />
            )}
            <span>
              {isDataReady
                ? 'Corridors Synchronized • Ready'
                : statusStage === 0
                ? 'Connecting to Amritsar Railway Hub...'
                : statusStage === 1
                ? 'Synchronizing Corridors & Track Geometry...'
                : 'Loading Live Crossing Predictions...'}
            </span>
          </motion.div>
        </div>

      </motion.div>
    </AnimatePresence>
  );
};
