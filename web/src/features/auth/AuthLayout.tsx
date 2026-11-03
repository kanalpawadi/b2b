import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BRAND, Mark, Wordmark } from '../../components/Brand';
import { ease } from '../../components/motion';

const THREADS = ['Vests', 'Briefs', 'Trunks', 'Bras', 'Panties', 'Camisoles', 'Nighties', 'Night suits', 'Pyjamas', 'Thermals'];

/** Fabric-swatch panel: slow drifting rows of trade names, like a mill's ledger. */
function StoryPanel() {
  return (
    <div className="weave grain relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between">
      <div className="relative z-10 p-10">
        <Link to="/" aria-label="Home"><Wordmark light /></Link>
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-5 pb-40 opacity-[0.14] [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_55%,transparent_80%)]">
        {[0, 1, 2, 3, 4].map((row) => (
          <motion.div
            key={row}
            className="flex shrink-0 gap-8 font-display text-[64px] leading-none whitespace-nowrap text-paper italic"
            animate={{ x: row % 2 ? ['-50%', '0%'] : ['0%', '-50%'] }}
            transition={{ duration: 60 + row * 9, repeat: Infinity, ease: 'linear' }}
          >
            {[...THREADS, ...THREADS].map((t, i) => (
              <span key={i}>{t} <span className="text-marigold not-italic">·</span></span>
            ))}
          </motion.div>
        ))}
      </div>

      <motion.div
        className="relative z-10 p-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease }}
      >
        <p className="max-w-md font-display text-[44px] leading-[1.02] text-paper">
          Your counter, <em className="text-marigold">always</em> stocked.
        </p>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-paper/70">
          Ladies’ and gents’ innerwear and nightwear. Browse the latest lots, order by the pack, and track every order with {BRAND.short}, straight from your shop.
        </p>
        <div className="mt-8 flex items-center gap-3 text-[12px] font-semibold tracking-[0.16em] text-paper/50 uppercase">
          <span className="h-px w-10 bg-paper/30" />
          Trade accounts only
        </div>
      </motion.div>
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const [adminRevealed, setAdminRevealed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Press and hold the mark for a second to reveal the admin door.
  const holdStart = () => {
    timer.current = window.setTimeout(() => setAdminRevealed(true), 900);
  };
  const holdEnd = () => window.clearTimeout(timer.current);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <StoryPanel />
      <div className="relative flex min-h-dvh flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onContextMenu={(e) => e.preventDefault()}
            className="select-none lg:invisible"
            aria-label={BRAND.name}
          >
            <Mark className="h-12" />
          </button>
          <button
            type="button"
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            className="hidden size-3 rounded-full bg-line-strong/60 lg:block"
            aria-hidden
            tabIndex={-1}
          />
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease }}>
            <h1 className="text-[38px] leading-[1.04] font-medium sm:text-[44px]">{title}</h1>
            {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{subtitle}</p>}
          </motion.div>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-[14.5px] text-ink-soft">{footer}</div>}
        </div>

        <AnimatePresence>
          {adminRevealed && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto flex items-center gap-4 rounded-full border border-line bg-card px-5 py-2.5 text-sm shadow-[var(--shadow-lift)]"
            >
              <span className="label-caps">Staff</span>
              <Link to="/sign-in" className="font-semibold text-indigo hover:underline">Admin sign in</Link>
              <span className="text-line-strong">|</span>
              <Link to="/admin/join" className="font-semibold text-indigo hover:underline">Request admin access</Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
