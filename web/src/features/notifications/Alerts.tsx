import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { Bell, Building2, CheckCheck, PackageCheck, PackagePlus, PackageX, ShoppingCart, UserPlus } from 'lucide-react';
import { useMarkAllRead, useNotifications } from '../../lib/queries';
import { dateTime, relative } from '../../lib/format';
import { Button, Empty, PageHeader, Skeleton } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { useMe } from '../auth/AuthProvider';
import type { Notification } from '../../lib/types';

const icons: Record<string, React.ReactNode> = {
  order_placed: <ShoppingCart className="size-4" />,
  order_completed: <PackageCheck className="size-4" />,
  order_cancelled: <PackageX className="size-4" />,
  retailer_joined: <UserPlus className="size-4" />,
  admin_request: <UserPlus className="size-4" />,
  admin_joined: <UserPlus className="size-4" />,
  company_added: <Building2 className="size-4" />,
  product_added: <PackagePlus className="size-4" />,
};

export function AlertIcon({ kind }: { kind: string }) {
  return (
    <span className={clsx('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
      kind.includes('cancel') ? 'bg-madder-100 text-madder'
        : kind.includes('complete') ? 'bg-leaf-100 text-leaf'
          : kind.endsWith('_added') ? 'bg-marigold-100 text-[#8a5a10]'
            : 'bg-indigo-100 text-indigo')}>
      {icons[kind] ?? <Bell className="size-4" />}
    </span>
  );
}

/** Where tapping an alert should go, if anywhere. */
export function alertLink(n: Pick<Notification, 'kind' | 'order_id' | 'company_id' | 'product_id'>, admin?: boolean): string | null {
  if (n.order_id) return admin ? `/admin/orders/${n.order_id}` : `/orders/${n.order_id}`;
  if (admin && n.company_id && n.product_id) return `/admin/companies/${n.company_id}/products/${n.product_id}`;
  if (admin && n.company_id) return `/admin/companies/${n.company_id}`;
  if (admin && (n.kind === 'admin_request' || n.kind === 'retailer_joined' || n.kind === 'admin_joined')) return '/admin/users';
  return null;
}

export function Alerts({ admin }: { admin?: boolean }) {
  const me = useMe();
  const navigate = useNavigate();
  const list = useNotifications(me.id);
  const markAll = useMarkAllRead(me.id);
  const unread = list.data?.filter((n) => !n.read_at).length ?? 0;

  // Opening the screen counts as reading; the dots stay for this visit.
  useEffect(() => {
    if (unread > 0) {
      const t = window.setTimeout(() => markAll.mutate(), 2500);
      return () => window.clearTimeout(t);
    }
  }, [unread]);

  const open = (n: Notification) => {
    const to = alertLink(n, admin);
    if (to) navigate(to);
  };

  return (
    <Page>
      <PageHeader eyebrow="Alerts" title={<>What’s <em className="text-indigo">new</em></>}>
        {unread > 0 && <Button variant="ghost" size="sm" icon={<CheckCheck className="size-4" />} onClick={() => markAll.mutate()}>Mark all read</Button>}
      </PageHeader>
      {list.isPending ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !list.data?.length ? (
        <Empty icon={<Bell className="size-7" />} title="All quiet" body={admin ? 'Orders, new retailers and catalogue changes will land here.' : 'Order updates and account news will land here.'} />
      ) : (
        <motion.ul variants={listParent} initial="hidden" animate="show" className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-card">
          {list.data.map((n) => (
            <motion.li key={n.id} variants={listChild}>
              <button onClick={() => open(n)} className="flex w-full items-start gap-4 p-4 text-left transition hover:bg-paper/60">
                <AlertIcon kind={n.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="block text-sm text-ink-soft">{n.body}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-ink-mute" title={dateTime(n.created_at)}>
                  {relative(n.created_at)}
                  {!n.read_at && <span className="size-2 rounded-full bg-marigold" />}
                </span>
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </Page>
  );
}
