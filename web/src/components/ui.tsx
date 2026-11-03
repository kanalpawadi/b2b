import {
  forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Loader2, Minus, Plus, X } from 'lucide-react';
import { ease } from './motion';
import type { AccountStatus, OrderStatus } from '../lib/types';

// ---------- Button ----------

type Variant = 'primary' | 'accent' | 'ghost' | 'outline' | 'danger';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

const variants: Record<Variant, string> = {
  primary: 'bg-indigo text-paper hover:bg-indigo-700 shadow-[inset_0_-2px_0_rgb(0_0_0/0.25)]',
  accent: 'bg-marigold text-indigo hover:brightness-105 shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]',
  ghost: 'text-ink-soft hover:bg-paper-2 hover:text-ink',
  outline: 'border border-line-strong bg-card text-ink hover:border-indigo hover:text-indigo',
  danger: 'bg-madder text-white hover:brightness-110',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      disabled={disabled || loading}
      className={clsx(
        'relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-9 px-4 text-sm',
        size === 'md' && 'h-11 px-5 text-[15px]',
        size === 'lg' && 'h-13 px-7 text-base',
        variants[variant],
        className,
      )}
      {...(rest as object)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx('grid size-10 place-items-center rounded-full text-ink-soft transition hover:bg-paper-2 hover:text-ink', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------- Form fields ----------

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="e"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[13px] font-medium text-madder"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <p className="text-[12.5px] text-ink-mute">{hint}</p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const fieldBase =
  'w-full rounded-xl border border-line bg-card px-3.5 text-[15px] text-ink placeholder:text-ink-mute/70 transition ' +
  'focus:border-indigo focus:outline-none focus:ring-4 focus:ring-indigo/10 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; invalid?: boolean }>(
  function Input({ className, prefix, invalid, ...rest }, ref) {
    if (prefix) {
      return (
        <div className={clsx('flex items-center rounded-xl border bg-card transition focus-within:border-indigo focus-within:ring-4 focus-within:ring-indigo/10', invalid ? 'border-madder' : 'border-line')}>
          <span className="pl-3.5 pr-1 text-[15px] font-medium text-ink-mute">{prefix}</span>
          <input ref={ref} className={clsx('h-12 w-full bg-transparent pr-3.5 text-[15px] focus:outline-none', className)} {...rest} />
        </div>
      );
    }
    return <input ref={ref} className={clsx(fieldBase, 'h-12', invalid && 'border-madder', className)} {...rest} />;
  },
);

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldBase, 'min-h-24 py-3', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(fieldBase, 'h-12 appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23857f70' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>\")" }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-3 text-sm font-medium text-ink-soft">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-leaf' : 'bg-line-strong')}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 700, damping: 35 }}
          className={clsx('absolute top-0.5 size-5 rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')}
        />
      </button>
      {label}
    </label>
  );
}

// ---------- Quantity stepper ----------

export function Stepper({ value, onChange, min = 0, max = 9999, size = 'md' }: { value: number; onChange: (n: number) => void; min?: number; max?: number; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  return (
    <div className={clsx('inline-flex items-center rounded-full border border-line bg-card', h)}>
      <button type="button" aria-label="Fewer" onClick={() => onChange(Math.max(min, value - 1))} className="grid aspect-square h-full place-items-center rounded-full text-ink-soft hover:text-indigo disabled:opacity-40" disabled={value <= min}>
        <Minus className="size-4" />
      </button>
      <div className="relative w-10 overflow-hidden text-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.input
            key={value}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.18 }}
            type="number"
            inputMode="numeric"
            aria-label="Packs"
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.floor(n))));
            }}
            className="tabular w-full bg-transparent text-center text-[15px] font-bold focus:outline-none"
          />
        </AnimatePresence>
      </div>
      <button type="button" aria-label="More" onClick={() => onChange(Math.min(max, value + 1))} className="grid aspect-square h-full place-items-center rounded-full text-ink-soft hover:text-indigo disabled:opacity-40" disabled={value >= max}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ---------- Status ----------

const orderTone: Record<OrderStatus, string> = {
  placed: 'bg-marigold-100 text-[#8a5a10]',
  completed: 'bg-leaf-100 text-leaf',
  cancelled: 'bg-madder-100 text-madder',
};
const orderLabel: Record<OrderStatus, string> = { placed: 'Open', completed: 'Completed', cancelled: 'Cancelled' };

export function OrderPill({ status }: { status: OrderStatus }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', orderTone[status])}>
      <span className={clsx('size-1.5 rounded-full bg-current', status === 'placed' && 'animate-pulse')} />
      {orderLabel[status]}
    </span>
  );
}

export function AccountPill({ status }: { status: AccountStatus }) {
  const tone = status === 'active' ? 'bg-leaf-100 text-leaf' : status === 'blocked' ? 'bg-madder-100 text-madder' : 'bg-marigold-100 text-[#8a5a10]';
  return <span className={clsx('rounded-full px-2.5 py-1 text-xs font-bold capitalize', tone)}>{status === 'pending' ? 'Awaiting approval' : status}</span>;
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
        active ? 'text-paper' : 'text-ink-soft hover:text-ink',
      )}
    >
      {active && <motion.span className="absolute inset-0 -z-0 rounded-full bg-indigo" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25, ease }} />}
      {!active && <span className="absolute inset-0 rounded-full border border-line bg-card" />}
      <span className="relative">{children}</span>
    </button>
  );
}

/** Tabs with an underline that slides between options. */
export function Segmented<T extends string>({ value, onChange, options, id }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; id: string }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-paper-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx('relative shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors', value === o.value ? 'text-ink' : 'text-ink-mute hover:text-ink-soft')}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(0_0_0/0.08)]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Layout bits ----------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-[var(--radius-card)] border border-line bg-card', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label-caps mb-1.5">{eyebrow}</p>}
        <h1 className="text-[32px] leading-[1.05] font-medium text-ink sm:text-[40px]">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
      <div className="mb-5 grid size-16 place-items-center rounded-2xl border border-dashed border-line-strong bg-card text-indigo">{icon}</div>
      <h3 className="text-xl font-medium">{title}</h3>
      <p className="mt-1.5 text-[14.5px] text-ink-mute">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-paper-2', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-indigo', className)} />;
}

export function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col items-center gap-3">
        <motion.div
          className="size-10 rounded-xl bg-indigo"
          animate={{ rotate: [0, 90, 90, 180], borderRadius: ['12px', '22px', '22px', '12px'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <p className="label-caps">Loading</p>
      </motion.div>
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 4;
  const tones = ['bg-indigo text-paper', 'bg-marigold text-indigo', 'bg-leaf text-white', 'bg-madder text-white'];
  return (
    <span className={clsx('grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-semibold', tones[hue], className)}>
      {name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')}
    </span>
  );
}

// ---------- Sheet (side panel on desktop, bottom sheet on phones) ----------

export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            className={clsx(
              'relative flex max-h-[92dvh] w-full flex-col rounded-t-[26px] bg-paper shadow-[var(--shadow-pop)] sm:max-h-none sm:rounded-none sm:rounded-l-[26px]',
              wide ? 'sm:w-[640px]' : 'sm:w-[480px]',
            )}
            initial={{ y: '100%', x: 0 }}
            animate={{ y: 0, x: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
            <header className="flex items-center justify-between gap-4 px-6 pt-4 pb-3 sm:pt-6">
              <div className="min-w-0 text-xl font-medium">{title}</div>
              <IconButton label="Close" onClick={onClose}>
                <X className="size-5" />
              </IconButton>
            </header>
            <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
            {footer && <footer className="border-t border-line bg-card/60 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel, tone = 'danger', loading, children }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel: string;
  tone?: 'danger' | 'primary'; loading?: boolean; children?: ReactNode;
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4">
          <motion.div className="absolute inset-0 bg-ink/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="alertdialog"
            className="relative w-full max-w-md rounded-[22px] bg-paper p-6 shadow-[var(--shadow-pop)]"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease }}
          >
            <h3 className="text-2xl font-medium">{title}</h3>
            <div className="mt-2 text-[14.5px] text-ink-soft">{body}</div>
            {children && <div className="mt-4">{children}</div>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Not now</Button>
              <Button variant={tone} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
