import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase';
import { dateOnly, displayPhone, num } from '../../lib/format';
import type { OrderItem, OrderWithItems, Profile } from '../../lib/types';
import { BRAND, MSC_LOGO } from '../../components/Brand';

// The invoice is laid out as plain HTML with inline styles (so the PDF looks
// the same whatever the app's CSS does), rendered off-screen, photographed
// with html2canvas and placed on A4 pages by jsPDF. Both libraries load
// only when someone actually downloads an invoice.
//
// It lists packs and quantities only: the app handles no prices at all.

const A4_W = 794; // CSS px at 96 dpi
const A4_H = Math.round(A4_W * (297 / 210));
const MARGIN = 40;
/** More numbered size columns than this won't fit on A4; sizes then go in one text column. */
const MAX_SIZE_COLS = 12;

const C = {
  ink: '#1a1f2b', soft: '#4a4f5c', mute: '#857f70', line: '#e6dfd1', grid: '#d9d1c1', paper: '#f7f3ec',
  indigo: '#1e2a4a', navy: '#2e3a8c', magenta: '#c2297b', marigold: '#e09a2c', leaf: '#3d7a55', madder: '#b4432e',
};
const display = '"Fraunces Variable", Georgia, serif';
const sans = '"Manrope Variable", system-ui, sans-serif';

interface History {
  position: number;
  total: number;
  completed: number;
  packs: number;
}

/** One bill row: a design, with the pieces ordered in each of its sizes. */
interface BillRow {
  key: string;
  company: string;
  name: string;
  trade: string | null;
  sizes: string[];
  qty: Record<string, number>;
  packs: number;
  pieces: number;
}

interface InvoiceData {
  order: OrderWithItems;
  rows: BillRow[];
  buyer: Pick<Profile, 'full_name' | 'shop_name' | 'phone' | 'email' | 'gst_number' | 'area' | 'city' | 'state'> | null;
  history: History | null;
}

type ProductInfo = { id: string; sizes: string[]; trade: { name: string } | null };

/** Groups the order's lines (one per size pack) into one row per design. */
function billRows(items: OrderItem[], products: Map<string, ProductInfo>): BillRow[] {
  const rows = new Map<string, BillRow>();
  for (const it of items) {
    const key = it.product_id ?? `${it.company_name}|${it.product_name}`;
    const info = it.product_id ? products.get(it.product_id) : undefined;
    let row = rows.get(key);
    if (!row) {
      row = { key, company: it.company_name, name: it.product_name, trade: info?.trade?.name ?? null, sizes: [...(info?.sizes ?? [])], qty: {}, packs: 0, pieces: 0 };
      rows.set(key, row);
    }
    row.packs += it.packs;
    row.pieces += it.line_pieces;
    for (const line of it.composition) {
      row.qty[line.size] = (row.qty[line.size] ?? 0) + line.qty * it.packs;
      if (!row.sizes.includes(line.size)) row.sizes.push(line.size);  // product since changed or removed
    }
  }
  // Sizes nobody ordered at the end of a list don't need a column.
  for (const row of rows.values()) {
    let last = row.sizes.length - 1;
    while (last >= 0 && !row.qty[row.sizes[last]!]) last--;
    row.sizes = row.sizes.slice(0, last + 1);
  }
  return [...rows.values()];
}

async function load(orderId: string): Promise<InvoiceData> {
  const { data: order, error } = await supabase.from('orders').select('*, items:order_items(*)').eq('id', orderId).single();
  if (error || !order) throw error ?? new Error('Order not found');
  const o = order as OrderWithItems;

  const ids = [...new Set(o.items.map((i) => i.product_id).filter((x): x is string => Boolean(x)))];
  const { data: prods } = ids.length
    ? await supabase.from('products').select('id, sizes, trade:trades(name)').in('id', ids)
    : { data: [] };
  const products = new Map(((prods ?? []) as unknown as ProductInfo[]).map((p) => [p.id, p]));
  const rows = billRows(o.items, products);
  if (!o.retailer_id) return { order: o, rows, buyer: null, history: null };

  const [{ data: buyer }, { data: past }, { data: dir }] = await Promise.all([
    supabase.from('profiles').select('full_name, shop_name, phone, email, gst_number, area, city, state').eq('id', o.retailer_id).maybeSingle(),
    supabase.from('orders').select('id, status, created_at').eq('retailer_id', o.retailer_id),
    supabase.from('user_directory').select('packs_ordered').eq('id', o.retailer_id).maybeSingle(),
  ]);
  const history = (past ?? []) as { id: string; status: string; created_at: string }[];
  return {
    order: o,
    rows,
    buyer: buyer as InvoiceData['buyer'],
    history: {
      position: history.filter((r) => r.created_at <= o.created_at).length,
      total: history.length,
      completed: history.filter((r) => r.status === 'completed').length,
      packs: Number((dir as { packs_ordered?: number } | null)?.packs_ordered ?? 0),
    },
  };
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

function Invoice({ order: o, rows, buyer, history }: InvoiceData) {
  const totalPacks = rows.reduce((s, r) => s + r.packs, 0);
  const totalPieces = rows.reduce((s, r) => s + r.pieces, 0);
  const cols = Math.max(1, ...rows.map((r) => r.sizes.length));
  const compact = cols > MAX_SIZE_COLS;
  // Column k's header lists every size that sits k-th in some row, stacked, as on a printed bill.
  const heads = Array.from({ length: compact ? 0 : cols }, (_, k) => [...new Set(rows.map((r) => r.sizes[k]).filter(Boolean))] as string[]);
  const status = o.status === 'placed' ? { label: 'Open', bg: '#f8e7c8', fg: '#8a5a10' }
    : o.status === 'completed' ? { label: 'Completed', bg: '#dbeadf', fg: C.leaf } : { label: 'Cancelled', bg: '#f3dcd4', fg: C.madder };
  const address = buyer ? [buyer.area, buyer.city, buyer.state].filter(Boolean).join(', ') : o.city;

  const cell: React.CSSProperties = { border: `1px solid ${C.grid}`, padding: '7px 6px', fontSize: 11.5, color: C.ink, verticalAlign: 'middle' };
  const th: React.CSSProperties = { ...cell, background: C.indigo, color: '#fff', borderColor: C.indigo, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left' };
  const sizeW = compact ? 0 : Math.max(26, Math.min(44, Math.floor(300 / cols)));

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

      {/* Party + history */}
      <div data-block style={{ padding: `22px ${MARGIN}px 0`, display: 'flex', gap: 16 }}>
        <div style={{ flex: 1.3, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, color: C.mute }}>PARTY</div>
          <div style={{ fontFamily: display, fontSize: 19, fontWeight: 600, marginTop: 6 }}>{buyer?.shop_name ?? o.shop_name ?? o.retailer_name}</div>
          <div style={{ fontSize: 12.5, color: C.soft, marginTop: 2 }}>{buyer?.full_name ?? o.retailer_name}</div>
          <div style={{ fontSize: 12, color: C.soft, marginTop: 8, lineHeight: 1.6 }}>
            {address && <div>{address}</div>}
            {(buyer?.phone ?? o.retailer_phone) && <div>Mobile: {displayPhone(buyer?.phone ?? o.retailer_phone)}</div>}
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
                <div style={{ gridColumn: 'span 2' }}><Stat k="Packs ordered to date" v={num(history.packs)} /></div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, marginTop: 8, color: 'rgba(255,255,255,0.7)' }}>This account has since been removed.</div>
          )}
        </div>
      </div>

      {/* Items: Sr · Company · Trade name · sizes · Packs · Total qty */}
      <div style={{ padding: `22px ${MARGIN}px 0` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 30 }} />
            <col style={{ width: compact ? 120 : 104 }} />
            <col />
            {compact ? <col style={{ width: 220 }} /> : heads.map((_, k) => <col key={k} style={{ width: sizeW }} />)}
            <col style={{ width: 46 }} />
            <col style={{ width: 54 }} />
          </colgroup>
          <thead data-block>
            <tr>
              <th style={{ ...th, textAlign: 'center' }}>Sr</th>
              <th style={th}>Company</th>
              <th style={th}>Trade name</th>
              {compact ? <th style={th}>Sizes (pieces)</th> : heads.map((labels, k) => (
                <th key={k} style={{ ...th, textAlign: 'center', padding: '5px 2px', letterSpacing: 0, textTransform: 'none', fontSize: 9, lineHeight: 1.25 }}>
                  {labels.slice(0, 4).map((l) => <div key={l} style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>{l}</div>)}
                  {labels.length > 4 && <div style={{ opacity: 0.7 }}>+{labels.length - 4}</div>}
                </th>
              ))}
              <th style={{ ...th, textAlign: 'right' }}>Packs</th>
              <th style={{ ...th, textAlign: 'right' }}>Total qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} data-block style={{ background: i % 2 ? C.paper : '#fff' }}>
                <td style={{ ...cell, textAlign: 'center', color: C.mute }}>{i + 1}</td>
                <td style={{ ...cell, fontWeight: 700, fontSize: 11 }}>{r.company}</td>
                <td style={cell}>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  {r.trade && <div style={{ fontSize: 10, color: C.mute }}>{r.trade}</div>}
                </td>
                {compact ? (
                  <td style={{ ...cell, fontSize: 10.5, color: C.soft }}>{r.sizes.filter((s) => r.qty[s]).map((s) => `${s}×${r.qty[s]}`).join('  ')}</td>
                ) : heads.map((_, k) => {
                  const size = r.sizes[k];
                  const q = size ? r.qty[size] : 0;
                  return <td key={k} style={{ ...cell, textAlign: 'center', fontWeight: 700, padding: '7px 2px' }}>{q ? num(q) : ''}</td>;
                })}
                <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{num(r.packs)}</td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{num(r.pieces)}</td>
              </tr>
            ))}
            <tr data-block>
              <td colSpan={3 + (compact ? 1 : heads.length)} style={{ ...cell, textAlign: 'right', fontWeight: 700, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', background: C.paper }}>Total</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 800, background: C.paper }}>{num(totalPacks)}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 800, background: C.paper }}>{num(totalPieces)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totals + note */}
      <div data-block style={{ padding: `18px ${MARGIN}px 0`, display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, fontSize: 12, color: C.soft, lineHeight: 1.6 }}>
          {o.note && <div style={{ background: C.paper, borderRadius: 10, padding: 12, marginBottom: 10 }}><b>Note from the shop:</b> {o.note}</div>}
          {o.cancel_reason && <div style={{ background: '#f3dcd4', color: C.madder, borderRadius: 10, padding: 12 }}><b>Cancelled:</b> {o.cancel_reason}</div>}
        </div>
        <div style={{ width: 300, borderRadius: 12, padding: '14px 16px', background: `linear-gradient(135deg, ${C.navy}, ${C.indigo})`, color: '#fff', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>TOTAL PACKS</div>
            <div style={{ fontFamily: display, fontSize: 26, fontWeight: 600 }}>{num(totalPacks)}</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>TOTAL QUANTITY</div>
            <div style={{ fontFamily: display, fontSize: 26, fontWeight: 600 }}>{num(totalPieces)} <span style={{ fontSize: 13 }}>pcs</span></div>
          </div>
        </div>
      </div>

      {/* Footer + signatures */}
      <div data-block style={{ padding: `26px ${MARGIN}px ${MARGIN}px` }}>
        <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 14, fontSize: 10.5, color: C.mute, lineHeight: 1.6 }}>
          This order invoice lists the packs and quantities ordered from {BRAND.name}.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 40 }}>
          <Signature label="Receiver’s signature" />
          <Signature label={`for ${BRAND.name} · Authorised signatory`} align="right" />
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

function Signature({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <div style={{ width: 260, textAlign: align }}>
      <div style={{ height: 34, borderBottom: `1px solid ${C.grid}` }} />
      <div style={{ fontSize: 10.5, color: C.soft, marginTop: 6 }}>{label}</div>
    </div>
  );
}

/** Waits for every image in the invoice (only the logo now) so it's in the capture. */
async function imagesReady(root: HTMLElement) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise<void>((done) => {
    img.addEventListener('load', () => done(), { once: true });
    img.addEventListener('error', () => done(), { once: true });
    window.setTimeout(done, 5000);
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
