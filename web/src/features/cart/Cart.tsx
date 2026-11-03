import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cart, cartTotals, useCart } from '../../lib/cart';
import { usePlaceOrder } from '../../lib/queries';
import { friendlyError } from '../../lib/supabase';
import { money, num } from '../../lib/format';
import { Button, Card, Empty, PageHeader, Stepper, TextArea } from '../../components/ui';
import { ease, Page, Ticker } from '../../components/motion';
import { ProductImage } from '../catalogue/Swatch';
import type { Order } from '../../lib/types';

export function Cart() {
  const { lines, note } = useCart();
  const totals = cartTotals(lines);
  const place = usePlaceOrder();
  const navigate = useNavigate();
  const [placed, setPlaced] = useState<Order | null>(null);

  const submit = () => {
    place.mutate(
      { items: lines.map((l) => ({ pack_id: l.packId, packs: l.packs })), key: cart.checkoutKey(), note },
      {
        onSuccess: (order) => {
          cart.clear();
          setPlaced(order);
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  };

  if (placed) return <Placed order={placed} onView={() => navigate(`/orders/${placed.id}`)} />;

  if (!lines.length) {
    return (
      <Page>
        <PageHeader eyebrow="Cart" title="Your cart" />
        <Empty icon={<ShoppingBag className="size-7" />} title="Nothing here yet" body="Pick packs from the catalogue and they’ll gather here until you place the order." action={<Link to="/"><Button>Browse catalogue</Button></Link>} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader eyebrow="Cart" title={<>Review your <em className="text-indigo">order</em></>} />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {lines.map((l) => (
              <motion.li key={l.packId} layout exit={{ opacity: 0, x: -40, height: 0, marginTop: 0 }} transition={{ duration: 0.3, ease }}>
                <Card className="flex gap-4 p-3 sm:p-4">
                  <ProductImage path={l.imagePath} name={l.productName} className="h-24 w-20 shrink-0 sm:h-28 sm:w-24" rounded="rounded-xl" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="label-caps truncate">{l.companyName}</p>
                        <p className="truncate font-display text-lg font-medium">{l.productName}</p>
                        <p className="text-sm text-ink-mute">{l.packLabel} · {l.packSummary}</p>
                      </div>
                      <button onClick={() => cart.remove(l.packId)} aria-label="Remove" className="grid size-9 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-madder-100 hover:text-madder">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <Stepper size="sm" value={l.packs} min={1} onChange={(n) => cart.setPacks(l.packId, n)} />
                      <div className="text-right">
                        <p className="tabular font-bold">{money(l.packs * l.piecesPerPack * l.pricePerPiece)}</p>
                        <p className="tabular text-xs text-ink-mute">{num(l.packs * l.piecesPerPack)} pcs</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <div className="weave grain relative p-5 text-paper">
              <p className="relative text-[11px] font-semibold tracking-[0.16em] text-paper/60 uppercase">Estimated total</p>
              <p className="relative mt-1 font-display text-[40px] leading-none font-medium"><Ticker value={totals.amount} format={money} /></p>
              <p className="relative mt-2 text-sm text-paper/70">{num(totals.packs)} packs · {num(totals.pieces)} pieces</p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="note" className="mb-1.5 block text-[13px] font-semibold text-ink-soft">Note for the office (optional)</label>
                <TextArea id="note" value={note} onChange={(e) => cart.setNote(e.target.value)} placeholder="Delivery timing, transport, colours…" maxLength={500} />
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-mute">Prices are confirmed by Mukesh Sales when the order is placed. Taxes and freight as per invoice.</p>
              <Button size="lg" className="w-full" onClick={submit} loading={place.isPending}>
                Place order <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Placed({ order, onView }: { order: Order; onView: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="text-center">
        <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }} className="mx-auto mb-6 grid size-24 place-items-center rounded-full bg-leaf text-white shadow-[var(--shadow-pop)]">
          <CheckCircle2 className="size-12" />
        </motion.div>
        <p className="label-caps">Order #{order.order_number}</p>
        <h1 className="mt-2 text-[40px] leading-tight font-medium">Order <em className="text-indigo">placed.</em></h1>
        <p className="mx-auto mt-3 max-w-sm text-ink-soft">{num(order.total_pieces)} pieces worth {money(order.total_amount)}. We’ll notify you as soon as it’s dispatched.</p>
        <div className="mt-8 flex justify-center gap-2">
          <Button onClick={onView}>View order</Button>
          <Link to="/"><Button variant="outline">Keep shopping</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}
