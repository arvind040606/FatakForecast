import { Variants, Transition } from 'framer-motion';

// Respect reduced motion query check
export const isReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Polished Spring Configurations
export const smoothSpring: Transition = {
  type: 'spring',
  damping: 24,
  stiffness: 260,
  mass: 0.8
};

export const snappySpring: Transition = {
  type: 'spring',
  damping: 20,
  stiffness: 300,
  mass: 0.6
};

export const gentleSpring: Transition = {
  type: 'spring',
  damping: 28,
  stiffness: 180,
  mass: 1.0
};

// Fade & Scale In (for dialogs, cards)
export const dialogVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 12
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: smoothSpring
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: 0.15 }
  }
};

// Android-first Bottom Sheet Variants (slides up from bottom on mobile)
export const bottomSheetVariants: Variants = {
  hidden: {
    y: '100%',
    opacity: 0.4
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      damping: 28,
      stiffness: 260,
      mass: 0.9
    }
  },
  exit: {
    y: '100%',
    opacity: 0,
    transition: {
      duration: 0.22,
      ease: [0.4, 0, 0.2, 1]
    }
  }
};

// Side Drawer Variants (desktop slide over)
export const sideDrawerVariants: Variants = {
  hidden: {
    x: '100%',
    opacity: 0.5
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: smoothSpring
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1]
    }
  }
};

// Stagger Container
export const staggerListVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05
    }
  }
};

// Stagger Item (card / row)
export const staggerItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.2, 0.8, 0.2, 1]
    }
  }
};

// Timeline Railway Stop Animation
export const timelineStopVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -8
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.25,
      ease: [0.2, 0.8, 0.2, 1]
    }
  }
};
