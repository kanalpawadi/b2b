import { useEffect, useRef, type ReactNode } from 'react';
import { animate, motion, useInView, useMotionValue, useTransform, type Variants } from 'motion/react';

export const ease = [0.22, 1, 0.36, 1] as const;

/** Every screen enters the same way: a short rise, nothing flashy. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ duration: 0.45, ease }}
    >
      {children}
    </motion.div>
  );
}

export const listParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};

export const listChild: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease } },
};

/** Counts up to a value the first time it scrolls into view. */
export function Ticker({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(Math.round(v)));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 1.1, ease });
    return () => controls.stop();
  }, [inView, value, mv]);

  return <motion.span ref={ref} className="tabular">{text}</motion.span>;
}
