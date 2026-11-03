import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { Building2, ImagePlus, Link2, Plus, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCompany, useDeleteProduct, useProduct, useSaveProduct, useTrades } from '../../lib/queries';
import { friendlyError, isWebUrl } from '../../lib/supabase';
import { removeProductImages, uploadProductImage } from '../../lib/images';
import { money } from '../../lib/format';
import { Button, Card, Confirm, Empty, Field, Input, PageHeader, Select, Skeleton, Spinner, Toggle } from '../../components/ui';
import { Page } from '../../components/motion';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { CompanyLogo } from '../../components/CompanyLogo';
import { TagInput } from '../../components/TagInput';
import { ProductImage } from '../catalogue/Swatch';
import type { ProductWithRefs } from '../../lib/types';

const NEW_TRADE = '__new__';
const MAX_IMAGES = 8;
const SIZE_HINTS = ['S', 'M', 'L', 'XL', 'XXL', 'Free Size'];

type Errors = Partial<Record<'name' | 'trade' | 'rate' | 'mrp' | 'sizes' | 'images' | 'pack_of', string>>;

/** Decimal with up to two places, no sign. */
const isAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

export function ProductFormPage() {
  const { companyId, productId } = useParams();
  const company = useCompany(companyId);
  const product = useProduct(productId);

  if (company.isPending || (productId && product.isPending)) {
    return <Page><Skeleton className="mb-6 h-10 w-64" /><Skeleton className="h-[480px]" /></Page>;
  }
  if (!company.data || (productId && (!product.data || product.data.company_id !== companyId))) {
    return (
      <Page>
        <Empty icon={<Building2 className="size-7" />} title={productId ? 'Product not found' : 'Company not found'} body="It may have been removed."
          action={<Link to="/admin/companies"><Button variant="outline">All companies</Button></Link>} />
      </Page>
    );
  }
  return <ProductForm key={productId ?? 'new'} companyId={company.data.id} companyName={company.data.name} companyLogo={company.data.logo_path} product={product.data ?? null} />;
}

function ProductForm({ companyId, companyName, companyLogo, product }: { companyId: string; companyName: string; companyLogo: string | null; product: ProductWithRefs | null }) {
  const navigate = useNavigate();
  const trades = useTrades();
  const save = useSaveProduct();
  const del = useDeleteProduct();
  const fileRef = useRef<HTMLInputElement>(null);
  const storageKey = useMemo(() => product?.id ?? crypto.randomUUID(), [product]);
  const back = `/admin/companies/${companyId}`;

  const [f, setF] = useState({
    name: product?.name ?? '',
    tradeId: product?.trade_id ?? '',
    newTrade: '',
    rate: product ? String(product.price_per_piece) : '',
    mrp: product?.mrp ? String(product.mrp) : '',
    packOf: product?.pack_of ? String(product.pack_of) : '',
    isActive: product?.is_active ?? true,
  });
  const [colours, setColours] = useState<string[]>(product?.colours ?? []);
  const [sizes, setSizes] = useState<string[]>(product?.sizes ?? []);
  const [images, setImages] = useState<string[]>(product?.image_paths ?? []);
  const [urlDraft, setUrlDraft] = useState('');
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uploaded = useRef<string[]>([]);

  // A brand-new company has no trades yet: start on "new trade".
  useEffect(() => {
    if (!product && trades.data && !trades.data.length) setF((v) => ({ ...v, tradeId: NEW_TRADE }));
  }, [trades.data, product]);

  const set = (patch: Partial<typeof f>, clear?: keyof Errors) => {
    setF((v) => ({ ...v, ...patch }));
    if (clear) setErrors((v) => ({ ...v, [clear]: undefined }));
  };

  const addUrl = () => {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\/\S+$/i.test(u)) return setErrors({ ...errors, images: 'Enter a full web address starting with http:// or https://' });
    if (images.includes(u)) return setUrlDraft('');
    if (images.length >= MAX_IMAGES) return setErrors({ ...errors, images: `Up to ${MAX_IMAGES} images.` });
    setImages([...images, u]);
    setUrlDraft('');
    setErrors({ ...errors, images: undefined });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].slice(0, MAX_IMAGES - images.length);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const path = await uploadProductImage(storageKey, file);
        uploaded.current.push(path);
        setImages((imgs) => [...imgs, path]);
      } catch (e) {
        toast.error(friendlyError(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = 'Enter the product name.';
    if (!f.tradeId) e.trade = 'Choose a trade.';
    else if (f.tradeId === NEW_TRADE && !f.newTrade.trim()) e.trade = 'Type the new trade’s name.';
    if (!isAmount(f.rate) || Number(f.rate) <= 0) e.rate = 'Enter a rate above zero, e.g. 450 or 450.50.';
    if (!isAmount(f.mrp) || Number(f.mrp) <= 0) e.mrp = 'Enter the MRP, e.g. 899.';
    else if (!e.rate && Number(f.mrp) < Number(f.rate)) e.mrp = 'MRP can’t be lower than the rate.';
    if (!sizes.length) e.sizes = 'Add at least one size.';
    if (!/^\d+$/.test(f.packOf.trim()) || Number(f.packOf) < 1 || Number(f.packOf) > 999) e.pack_of = 'Enter a whole number of pieces, 1 to 999.';
    if (urlDraft.trim()) e.images = 'Press Add to include the image address you typed, or clear it.';
    return e;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return toast.error('Check the highlighted fields');

    const newTrade = f.tradeId === NEW_TRADE;
    save.mutate({
      id: product?.id,
      input: {
        company_id: companyId,
        trade_id: newTrade ? null : f.tradeId,
        trade_name: newTrade ? f.newTrade.trim() : null,
        name: f.name.trim(),
        rate: Number(f.rate),
        mrp: Number(f.mrp),
        colours, sizes, image_paths: images,
        pack_of: Number(f.packOf),
        is_active: f.isActive,
      },
    }, {
      onSuccess: () => {
        removeProductImages((product?.image_paths ?? []).filter((p) => !images.includes(p)));
        toast.success(product ? 'Product updated' : 'Product added', { description: product ? undefined : 'Retailers have been notified.' });
        navigate(back);
      },
      onError: (err) => {
        const msg = friendlyError(err);
        if (/already exists/i.test(msg)) setErrors({ name: msg });
        toast.error(msg);
      },
    });
  };

  const cancel = () => {
    // Photos uploaded during this visit and never saved shouldn't linger in storage.
    removeProductImages(uploaded.current.filter((p) => !(product?.image_paths ?? []).includes(p)));
    navigate(back);
  };

  const legacyPacks = product?.packs.some((k) => k.composition.length > 1);
  const perPack = Number(f.rate) > 0 && Number(f.packOf) > 0 ? Number(f.rate) * Number(f.packOf) : 0;

  return (
    <Page>
      <Breadcrumbs back={back} items={[{ label: 'Companies', to: '/admin/companies' }, { label: companyName, to: back }, { label: product ? product.name : 'Add product' }]} />
      <PageHeader eyebrow={product ? 'Edit product' : 'New product'} title={product ? product.name : <>Add a <em className="text-indigo">product</em></>}>
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
          <CompanyLogo path={companyLogo} name={companyName} className="size-9 rounded-xl" /> {companyName}
        </span>
      </PageHeader>

      {legacyPacks && (
        <Card className="mb-6 border-marigold bg-marigold-100 p-4 text-sm text-[#6d470c]">
          This product was set up with mixed-size packs. Saving switches it to one pack of <b>{f.packOf || 'N'}</b> pieces per size. Past orders keep their details.
        </Card>
      )}

      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-6 p-5 sm:p-6">
          <Field label="Product name" htmlFor="pname" error={errors.name}>
            <Input id="pname" value={f.name} maxLength={120} invalid={!!errors.name} placeholder="e.g. Anarkali Kurti" onChange={(e) => set({ name: e.target.value }, 'name')} />
          </Field>

          <Field label="Trade" htmlFor="ptrade" error={errors.trade} hint={`The section retailers find it under in ${companyName}.`}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select id="ptrade" value={f.tradeId} onChange={(e) => set({ tradeId: e.target.value }, 'trade')} className="sm:max-w-64">
                <option value="">Choose…</option>
                {trades.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value={NEW_TRADE}>+ New trade…</option>
              </Select>
              <AnimatePresence>
                {f.tradeId === NEW_TRADE && (
                  <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex-1">
                    <Input autoFocus value={f.newTrade} maxLength={80} placeholder="e.g. Kurtis" invalid={!!errors.trade} onChange={(e) => set({ newTrade: e.target.value }, 'trade')} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Rate (wholesale, per piece)" htmlFor="prate" error={errors.rate}>
              <Input id="prate" prefix="₹" inputMode="decimal" value={f.rate} invalid={!!errors.rate} placeholder="0.00" onChange={(e) => set({ rate: e.target.value.replace(/[^\d.]/g, '') }, 'rate')} />
            </Field>
            <Field label="MRP" htmlFor="pmrp" error={errors.mrp}>
              <Input id="pmrp" prefix="₹" inputMode="decimal" value={f.mrp} invalid={!!errors.mrp} placeholder="0.00" onChange={(e) => set({ mrp: e.target.value.replace(/[^\d.]/g, '') }, 'mrp')} />
            </Field>
            <Field label="Pack of (pieces)" htmlFor="ppack" error={errors.pack_of}>
              <Input id="ppack" inputMode="numeric" value={f.packOf} invalid={!!errors.pack_of} placeholder="e.g. 6" onChange={(e) => set({ packOf: e.target.value.replace(/\D/g, '') }, 'pack_of')} />
            </Field>
          </div>

          <Field label="Sizes" htmlFor="psizes" error={errors.sizes} hint="Type any size and press Enter: S, 32, 3–4 Y, Free Size… Each size is ordered in its own pack.">
            <TagInput id="psizes" values={sizes} maxLength={20} invalid={!!errors.sizes} placeholder="Type a size and press Enter" suggestions={SIZE_HINTS}
              onChange={(v) => { setSizes(v); setErrors((e) => ({ ...e, sizes: undefined })); }} />
          </Field>

          <Field label="Colours" htmlFor="pcolours" hint="Optional. Type each colour and press Enter.">
            <TagInput id="pcolours" values={colours} onChange={setColours} placeholder="e.g. Maroon, Navy, Bottle green" />
          </Field>

          <div className="space-y-1.5">
            <label htmlFor="purl" className="block text-[13px] font-semibold text-ink-soft">Image URL</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input id="purl" type="url" value={urlDraft} invalid={!!errors.images} placeholder="https://…/photo.jpg"
                  onChange={(e) => { setUrlDraft(e.target.value); setErrors((v) => ({ ...v, images: undefined })); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
              </div>
              <Button type="button" variant="outline" icon={<Link2 className="size-4" />} onClick={addUrl} disabled={!urlDraft.trim()}>Add</Button>
              <Button type="button" variant="ghost" icon={uploading ? <Spinner className="size-4" /> : <ImagePlus className="size-4" />} onClick={() => fileRef.current?.click()} disabled={images.length + uploading >= MAX_IMAGES}>
                <span className="hidden sm:inline">Upload</span>
              </Button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
            {errors.images ? <p className="text-[13px] font-medium text-madder">{errors.images}</p> : <p className="text-[12.5px] text-ink-mute">Optional. Paste an image address, or upload a photo. Add up to {MAX_IMAGES}; drag to reorder — the first is the cover.</p>}
            {images.length > 0 && (
              <Reorder.Group axis="x" values={images} onReorder={setImages} className="no-scrollbar flex gap-3 overflow-x-auto pt-2 pb-1">
                {images.map((path, i) => (
                  <Reorder.Item key={path} value={path} className="relative shrink-0 cursor-grab active:cursor-grabbing" title={isWebUrl(path) ? path : 'Uploaded photo'}>
                    <ProductImage path={path} name={f.name || 'Photo'} className="h-28 w-24" rounded="rounded-xl" />
                    {i === 0 && <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-0.5 text-[10px] font-bold"><Star className="size-3 fill-marigold text-marigold" />Cover</span>}
                    <button type="button" onClick={() => setImages(images.filter((x) => x !== path))} aria-label="Remove image" className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-ink/70 text-white">
                      <X className="size-3.5" />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>

          {product && <Toggle checked={f.isActive} onChange={(v) => set({ isActive: v })} label={f.isActive ? 'Live — retailers can order it' : 'Hidden from retailers'} />}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
            {product && <Button type="button" variant="ghost" className="text-madder" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <div className="flex-1" />
            <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={uploading > 0} icon={!product ? <Plus className="size-4" /> : undefined}>{product ? 'Save changes' : 'Add product'}</Button>
          </div>
        </Card>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="label-caps mb-3">How retailers will order it</p>
          <Card className="p-4">
            <ProductImage path={images[0]} name={f.name || 'Product'} className="aspect-[4/5] w-full" />
            <p className="mt-3 font-display text-lg leading-snug font-medium">{f.name.trim() || 'Product name'}</p>
            <p className="tabular mt-1 text-sm"><b>{Number(f.rate) > 0 ? money(Number(f.rate)) : '₹—'}</b> /pc {Number(f.mrp) > 0 && <span className="text-ink-mute">· MRP {money(Number(f.mrp))}</span>}</p>
            {colours.length > 0 && <p className="mt-1 text-xs text-ink-mute">{colours.join(' · ')}</p>}
            <div className="mt-3 space-y-1.5">
              {sizes.length ? sizes.map((s) => (
                <div key={s} className="flex justify-between rounded-lg bg-paper-2 px-3 py-1.5 text-xs">
                  <span className="font-bold">{s}</span>
                  <span className="tabular text-ink-soft">pack of {f.packOf || '—'}{perPack ? ` · ${money(perPack)}` : ''}</span>
                </div>
              )) : <p className="text-xs text-ink-mute">Sizes you add appear here.</p>}
            </div>
          </Card>
        </aside>
      </form>

      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} loading={del.isPending} title="Delete this product?" confirmLabel="Delete product"
        body="Past orders keep their copy of it. If you only want to stop selling it, switch it to Hidden instead."
        onConfirm={() => product && del.mutate(product.id, {
          onSuccess: () => { removeProductImages(product.image_paths); toast.success('Product deleted'); navigate(back); },
          onError: (e) => toast.error(friendlyError(e)),
        })} />
    </Page>
  );
}
