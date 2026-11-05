import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Bell, Home, Info, LogOut, ShoppingBag, UserRound } from 'lucide-react';
import { Wordmark } from './Brand';
import { useAuth, useMe } from '../features/auth/AuthProvider';
import { useNotifications } from '../lib/queries';
import { useCart, cartTotals } from '../lib/cart';
import { Avatar } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
  /** Also highlight on these sub-paths (Home stays lit inside /companies/…). */
  also?: string;
}

function lit(it: NavItem, isActive: boolean, pathname: string) {
  return isActive || (it.also ? pathname.startsWith(it.also) : false);
}

function useUnread() {
  const me = useMe();
  const { data } = useNotifications(me.id);
  return data?.filter((n) => !n.read_at).length ?? 0;
}

function Badge({ n }: { n: number }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span
          key={n}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
          className="tabular absolute -top-1 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-madder px-1 text-[10.5px] font-bold text-white ring-2 ring-paper"
        >
          {n > 99 ? '99+' : n}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Route outlet with a cross-fade between screens. */
function AnimatedOutlet() {
  const location = useLocation();
  const key = location.pathname.split('/').slice(0, 3).join('/');
  return (
    <AnimatePresence mode="wait">
      <motion.div key={key}>
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

function BottomBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 rounded-[22px] border border-line bg-card/90 p-1.5 shadow-[var(--shadow-lift)] backdrop-blur-md lg:hidden pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      <ul className="flex">
        {items.map((it) => (
          <li key={it.to} className="flex-1">
            <NavLink to={it.to} end={it.end} className="relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-semibold">
              {({ isActive: exact }) => {
                const isActive = lit(it, exact, pathname);
                return (
                <>
                  {isActive && <motion.span layoutId="bottom-pill" className="absolute inset-0 rounded-2xl bg-indigo" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className={clsx('relative transition-colors', isActive ? 'text-paper' : 'text-ink-mute')}>
                    {it.icon}
                    <Badge n={it.badge ?? 0} />
                  </span>
                  <span className={clsx('relative transition-colors', isActive ? 'text-paper' : 'text-ink-mute')}>{it.label}</span>
                </>
                );
              }}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------- Retailer: top bar ----------

export function RetailerShell() {
  const me = useMe();
  const unread = useUnread();
  const { lines } = useCart();
  const { packs } = cartTotals(lines);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: <Home className="size-5" />, end: true, also: '/companies' },
    { to: '/orders', label: 'Orders', icon: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 3h10l2 4v14H5V7z" /><path d="M5 7h14M9 12h6M9 16h4" /></svg> },
    { to: '/alerts', label: 'Alerts', icon: <Bell className="size-5" />, badge: unread },
    { to: '/account', label: 'Account', icon: <UserRound className="size-5" /> },
    { to: '/about', label: 'About', icon: <Info className="size-5" /> },
  ];

  return (
    <div className="min-h-dvh pb-28 lg:pb-12">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <NavLink to="/"><Wordmark /></NavLink>
          <nav className="hidden items-center gap-1 lg:flex">
            {items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className="relative px-4 py-2 text-[14px] font-semibold">
                {({ isActive: exact }) => {
                  const isActive = lit(it, exact, pathname);
                  return (
                  <>
                    <span className={clsx('relative transition-colors', isActive ? 'text-ink' : 'text-ink-mute hover:text-ink-soft')}>
                      {it.label}
                      <Badge n={it.badge ?? 0} />
                    </span>
                    {isActive && <motion.span layoutId="top-underline" className="absolute inset-x-4 -bottom-[13px] h-[3px] rounded-full bg-marigold" />}
                  </>
                  );
                }}
              </NavLink>
            ))}
          </nav>
          <motion.button
            onClick={() => navigate('/cart')}
            whileTap={{ scale: 0.95 }}
            className="relative flex h-11 items-center gap-2.5 rounded-full bg-indigo pr-4 pl-3 text-paper"
          >
            <ShoppingBag className="size-[18px]" />
            <span className="text-sm font-semibold">Cart</span>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={packs}
                id="cart-count"
                initial={{ y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 14, opacity: 0 }}
                className="tabular grid h-6 min-w-6 place-items-center rounded-full bg-marigold px-1.5 text-xs font-bold text-indigo"
              >
                {packs}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
        <p className="sr-only">Signed in as {me.full_name}</p>
        <AnimatedOutlet />
      </main>
      <BottomBar items={items} />
    </div>
  );
}

// ---------- Admin: sidebar ----------

export function AdminShell({ items }: { items: NavItem[] }) {
  const me = useMe();
  const { signOut } = useAuth();
  const unread = useUnread();
  const withBadges = items.map((it) => (it.to === '/admin/alerts' ? { ...it, badge: unread } : it));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="weave grain relative hidden flex-col overflow-hidden text-paper lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="relative px-6 pt-7 pb-8">
          <Wordmark light />
          <p className="mt-3 inline-flex rounded-full bg-paper/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-marigold">Back office</p>
        </div>
        <nav className="relative flex-1 space-y-0.5 px-3">
          {withBadges.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className="relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] font-semibold">
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="side-pill" className="absolute inset-0 rounded-xl bg-paper" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className={clsx('relative transition-colors', isActive ? 'text-indigo' : 'text-paper/70')}>
                    {it.icon}
                    <Badge n={it.badge ?? 0} />
                  </span>
                  <span className={clsx('relative transition-colors', isActive ? 'text-indigo' : 'text-paper/80 hover:text-paper')}>{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="relative m-3 flex items-center gap-3 rounded-2xl bg-paper/8 p-3">
          <Avatar name={me.full_name} className="size-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me.full_name}</p>
            <p className="text-[11.5px] text-paper/60">{me.is_owner ? 'Super admin' : 'Admin'}</p>
          </div>
          <button onClick={signOut} aria-label="Sign out" title="Sign out" className="grid size-9 place-items-center rounded-full text-paper/70 hover:bg-paper/10 hover:text-paper">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 pb-28 lg:pb-12">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line/70 bg-paper/85 px-4 backdrop-blur-md lg:hidden">
          <Wordmark />
          <button onClick={signOut} aria-label="Sign out" className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-paper-2">
            <LogOut className="size-4" />
          </button>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-8 sm:pt-10">
          <AnimatedOutlet />
        </main>
      </div>
      <BottomBar items={withBadges} />
    </div>
  );
}
