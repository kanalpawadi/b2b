import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { imageUrl, supabase } from '../../lib/supabase';
import { dateOnly, displayPhone, money, num } from '../../lib/format';
import type { OrderItem, OrderWithItems, Profile } from '../../lib/types';
import { BRAND, MSC_LOGO } from '../../components/Brand';

// The invoice is laid out as plain HTML with inline styles (so the PDF looks
// the same whatever the app's CSS does), rendered off-screen, photographed
// with html2canvas and placed on A4 pages by jsPDF. Both libraries load
// only when someone actually downloads an invoice.

const A4_W = 794; // CSS px at 96 dpi
const A4_H = Math.round(A4_W * (297 / 210));
const MARGIN = 40;

const C = {
  ink: '#1a1f2b', soft: '#4a4f5c', mute: '#857f70', line: '#e6dfd1', paper: '#f7f3ec',
  indigo: '#1e2a4a', navy: '#2e3a8c', magenta: '#c2297b', marigold: '#e09a2c', leaf: '#3d7a55', madder: '#b4432e',
};
const display = '"Fraunces Variable", Georgia, serif';
const sans = '"Manrope Variable", system-ui, sans-serif';

interface History {
  position: number;
  total: number;
  completed: number;
  lifetime: number;
}

interface InvoiceData {
  order: OrderWithItems;
  buyer: Pick<Profile, 'full_name' | 'shop_name' | 'phone' | 'email' | 'gst_number' | 'area' | 'city' | 'state'> | null;
  history: History | null;
}

async function load(orderId: string): Promise<InvoiceData> {
  const { data: order, error } = await supabase.from('orders').select('*, items:order_items(*)').eq('id', orderId).single();
  if (error || !order) throw error ?? new Error('Order not found');
  const o = order as OrderWithItems;
  if (!o.retailer_id) return { order: o, buyer: null, history: null };

  const [{ data: buyer }, { data: past }] = await Promise.all([
    supabase.from('profiles').select('full_name, shop_name, phone, email, gst_number, area, city, state').eq('id', o.retailer_id).maybeSingle(),
    supabase.from('orders').select('id, status, total_amount, created_at').eq('retailer_id', o.retailer_id),
  ]);
  const rows = (past ?? []) as { id: string; status: string; total_amount: number; created_at: string }[];
  return {
    order: o,
    buyer: buyer as InvoiceData['buyer'],
    history: {
      position: rows.filter((r) => r.created_at <= o.created_at).length,
      total: rows.length,
      completed: rows.filter((r) => r.status === 'completed').length,
      lifetime: rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + Number(r.total_amount), 0),
    },
  };
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

function packText(it: OrderItem) {
  if (it.composition.length === 1) return `Size ${it.composition[0]!.size} · pack of ${it.pieces_per_pack}`;
  return `${it.pack_label} · ${it.composition.map((l) => `${l.size}×${l.qty}`).join(' ')}`;
}

function Invoice({ order: o, buyer, history }: InvoiceData) {
  const packs = o.items.reduce((s, i) => s + i.packs, 0);
  const status = o.status === 'placed' ? { label: 'Open', bg: '#f8e7c8', fg: '#8a5a10' }
    : o.status === 'completed' ? { label: 'Completed', bg: '#dbeadf', fg: C.leaf } : { label: 'Cancelled', bg: '#f3dcd4', fg: C.madder };
  const address = buyer ? [buyer.area, buyer.city, buyer.state].filter(Boolean).join(', ') : o.city;
  const th: React.CSSProperties = { padding: '10px 8px', whiteSpace: 'nowrap', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', fontWeight: 700, textAlign: 'left' };
  const td: React.CSSProperties = { padding: '10px 8px', fontSize: 12.5, color: C.ink, verticalAlign: 'middle' };

  return (
    <div style={{ width: A4_W, background: '#fff', fontFamily: sans, color: C.ink, position: 'relative' }}>
      {o.status === 'cancelled' && (
        <div style={{ position: 'absolute', top: 380, left: 0, right: 0, textAlign: 'center', transform: 'rotate(-24deg)', fontFamily: display, fontSize: 120, fontWeight: 600, color: 'rgba(180,67,46,0.08)', letterSpacing: '0.08em', pointerEvents: 'none' }}>CANCELLED</div>
      )}

      {/* Header */}
      <div data-block style={{ padding: `${MARGIN}px ${MARGIN}px 0` }}>
        <div style={{ height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${C.navy} 0 55%, ${C.magenta} 55% 85%, #4a4a4a 85%)` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src={MSC_LOGO} alt="" style={{ height: 84, width: 'auto' }} />
            <div>
              <div style={{ fontFamily: display, fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: C.indigo }}>{BRAND.name}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: C.soft }}>Ladies’ &amp; gents’ innerwear and nightwear</div>
              <div style={{ fontSize: 11, color: C.mute }}>Wholesale distributor · since 2000</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.2em', fontWeight: 700, color: C.magenta }}>ORDER INVOICE</div>
            <div style={{ fontFamily: display, fontSize: 30, fontWeight: 600, color: C.indigo, lineHeight: 1.1, marginTop: 4 }}>#{o.order_number}</div>
            <div style={{ fontSize: 12, color: C.soft, marginTop: 4 }}>{dateOnly(o.created_at)} · {new Date(o.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>
            <span style={{ display: 'inline-block', marginTop: 8, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: status.bg, color: status.fg }}>{status.label}</span>
          </div>
        </div>
      </div>

      {/* Bill to + history */}
      <div data-block style={{ padding: `24px ${MARGIN}px 0`, display: 'flex', gap: 16 }}>
        <div style={{ flex: 1.3, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, color: C.mute }}>BILLED TO</div>
          <div style={{ fontFamily: display, fontSize: 19, fontWeight: 600, marginTop: 6 }}>{buyer?.shop_name ?? o.shop_name ?? o.retailer_name}</div>
          <div style={{ fontSize: 12.5, color: C.soft, marginTop: 2 }}>{buyer?.full_name ?? o.retailer_name}</div>
          <div style={{ fontSize: 12, color: C.soft, marginTop: 8, lineHeight: 1.6 }}>
            {address && <div>{address}</div>}
            {(buyer?.phone ?? o.retailer_phone) && <div>Mobile: {displayPhone(buyer?.phone ?? o.retailer_phone)}</div>}
            {buyer?.email && <div>{buyer.email}</div>}
            {buyer?.gst_number && <div>GSTIN: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{buyer.gst_number}</span></div>}
          </div>
        </div>
        <div style={{ flex: 1, borderRadius: 14, padding: 16, background: C.indigo, color: '#fff' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, color: C.marigold }}>YOUR ORDERS WITH US</div>
          {history ? (
            <>
              <div style={{ fontFamily: display, fontSize: 22, fontWeight: 600, marginTop: 6 }}>{ordinal(history.position)} order</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <Stat k="Total orders" v={num(history.total)} />
                <Stat k="Completed" v={num(history.completed)} />
                <div style={{ gridColumn: 'span 2' }}><Stat k="Business to date" v={money(history.lifetime)} /></div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, marginTop: 8, color: 'rgba(255,255,255,0.7)' }}>This account has since been removed.</div>
          )}
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: `24px ${MARGIN}px 0` }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead data-block>
            <tr style={{ background: C.indigo }}>
              <th style={{ ...th, borderTopLeftRadius: 10, width: 28, paddingLeft: 12 }}>#</th>
              <th style={th}>Item</th>
              <th style={th}>Pack</th>
              <th style={{ ...th, textAlign: 'right' }}>Packs</th>
              <th style={{ ...th, textAlign: 'right' }}>Pieces</th>
              <th style={{ ...th, textAlign: 'right' }}>Rate / pc</th>
              <th style={{ ...th, textAlign: 'right', borderTopRightRadius: 10, paddingRight: 12 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((it, i) => {
              const url = imageUrl(it.image_path);
              return (
                <tr key={it.id} data-block style={{ background: i % 2 ? C.paper : '#fff' }}>
                  <td style={{ ...td, color: C.mute, paddingLeft: 12, borderBottom: `1px solid ${C.line}` }}>{i + 1}</td>
                  <td style={{ ...td, borderBottom: `1px solid ${C.line}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 40, borderRadius: 6, overflow: 'hidden', background: C.line, flexShrink: 0, display: 'grid', placeItems: 'center', fontFamily: display, fontSize: 13, color: C.indigo }}>
                        {url ? <img src={url} crossOrigin="anonymous" alt="" data-thumb style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : it.product_name.slice(0, 1)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{it.product_name}</div>
                        <div style={{ fontSize: 11, color: C.mute }}>{it.company_name}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, color: C.soft, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.line}` }}>{packText(it)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${C.line}` }}>{num(it.packs)}</td>
                  <td style={{ ...td, textAlign: 'right', borderBottom: `1px solid ${C.line}` }}>{num(it.line_pieces)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.line}` }}>{money(it.price_per_piece)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', paddingRight: 12, borderBottom: `1px solid ${C.line}` }}>{money(it.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div data-block style={{ padding: `20px ${MARGIN}px 0`, display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, fontSize: 12, color: C.soft, lineHeight: 1.6 }}>
          {o.note && <div style={{ background: C.paper, borderRadius: 10, padding: 12, marginBottom: 10 }}><b>Note from the shop:</b> {o.note}</div>}
          {o.cancel_reason && <div style={{ background: '#f3dcd4', color: C.madder, borderRadius: 10, padding: 12 }}><b>Cancelled:</b> {o.cancel_reason}</div>}
        </div>
        <div style={{ width: 280 }}>
          <Line k="Items" v={num(o.items.length)} />
          <Line k="Packs" v={num(packs)} />
          <Line k="Pieces" v={num(o.total_pieces)} />
          <div style={{ marginTop: 10, borderRadius: 12, padding: '14px 16px', background: `linear-gradient(135deg, ${C.navy}, ${C.indigo})`, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>ORDER TOTAL</span>
            <span style={{ fontFamily: display, fontSize: 24, fontWeight: 600 }}>{money(o.total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div data-block style={{ padding: `28px ${MARGIN}px ${MARGIN}px` }}>
        <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 16, display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: 10.5, color: C.mute, lineHeight: 1.6 }}>
          <div style={{ maxWidth: 440 }}>
            Rates are as confirmed by {BRAND.name} when the order was placed. GST and freight are as per the final tax invoice.
            This document is an order invoice for your records.
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: display, fontSize: 15, fontStyle: 'italic', color: C.indigo }}>Thank you for your business.</div>
            <div>Generated {dateOnly(new Date().toISOString())}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.12em', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{k.toUpperCase()}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{v}</div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 4px', color: C.soft, borderBottom: `1px solid ${C.line}` }}>
      <span>{k}</span><b style={{ color: C.ink }}>{v}</b>
    </div>
  );
}

/** Waits for every image in the invoice; photos that can't load (no CORS, gone) are dropped, not fatal. */
async function imagesReady(root: HTMLElement) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise<void>((done) => {
    const finish = () => { if (!img.naturalWidth && img.dataset.thumb !== undefined) img.remove(); done(); };
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
    window.setTimeout(finish, 5000);
  }))));
}

/** Page slices in CSS px, breaking only between blocks (rows never split). */
function pageBreaks(root: HTMLElement): [number, number][] {
  const top0 = root.getBoundingClientRect().top;
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-block]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - top0, bottom: r.bottom - top0 };
  });
  const height = root.scrollHeight;
  const pages: [number, number][] = [];
  let start = 0;
  let cap = A4_H - MARGIN;
  for (const b of blocks) {
    if (b.bottom - start > cap && b.top > start) {
      pages.push([start, b.top]);
      start = b.top;
      cap = A4_H - MARGIN * 2;
    }
  }
  pages.push([start, height]);
  return pages;
}

/** Builds the invoice for an order and downloads it as MSC-Invoice-<no>.pdf. */
export async function downloadInvoice(orderId: string) {
  const [data, { default: html2canvas }, { jsPDF }] = await Promise.all([load(orderId), import('html2canvas-pro'), import('jspdf')]);

  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: `${A4_W}px`, pointerEvents: 'none' });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<Invoice {...data} />));
    const node = host.firstElementChild as HTMLElement;
    await document.fonts.ready;
    await imagesReady(node);

    const scale = 2;
    const canvas = await html2canvas(node, { scale, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ptPerPx = pageW / A4_W;
    const pages = pageBreaks(node);

    pages.forEach(([y0, y1], i) => {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.ceil((y1 - y0) * scale);
      slice.getContext('2d')!.drawImage(canvas, 0, y0 * scale, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (i > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, i === 0 ? 0 : MARGIN * ptPerPx, pageW, (y1 - y0) * ptPerPx);
      if (pages.length > 1) {
        pdf.setFontSize(8);
        pdf.setTextColor(133, 127, 112);
        pdf.text(`Order #${data.order.order_number} · page ${i + 1} of ${pages.length}`, pageW - MARGIN * ptPerPx, pageH - 18, { align: 'right' });
      }
    });

    pdf.setProperties({ title: `${BRAND.name} — Order #${data.order.order_number}`, author: BRAND.name, subject: 'Order invoice' });
    pdf.save(`MSC-Invoice-${data.order.order_number}.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
