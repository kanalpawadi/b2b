import { useEffect, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '../../lib/supabase';
import { isStaleBuildError, reloadForNewVersion } from '../../lib/staleBuild';
import { Button } from '../../components/ui';

/** Downloads the order's PDF invoice; with `auto`, also starts once on mount. */
export function InvoiceButton({ orderId, auto, variant = 'outline', size = 'md', className }: {
  orderId: string; auto?: boolean; variant?: 'outline' | 'primary' | 'accent' | 'ghost'; size?: 'sm' | 'md'; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const run = async () => {
    setBusy(true);
    try {
      const { downloadInvoice } = await import('./invoice');
      await downloadInvoice(orderId);
      toast.success('Invoice downloaded');
    } catch (e) {
      // The app was updated while this tab was open: load the new version on this order's page.
      if (isStaleBuildError(e)) {
        const page = window.location.pathname.startsWith('/admin') ? `/admin/orders/${orderId}` : `/orders/${orderId}`;
        if (reloadForNewVersion(page)) {
          toast.message('The app was just updated. Loading the new version…', { description: 'Tap Invoice PDF again once it opens.' });
          return;
        }
      }
      toast.error(`Couldn’t make the invoice. ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;  // StrictMode mounts twice in development
      run();
    }
  }, [auto]);

  return (
    <Button variant={variant} size={size} className={className} loading={busy} icon={<FileDown className="size-4" />} onClick={run}>
      {busy ? 'Preparing invoice…' : 'Invoice PDF'}
    </Button>
  );
}
