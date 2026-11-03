import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Building2, Eye, EyeOff, ImagePlus, Pencil, Plus, RefreshCw, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCompanies, useCompany, useCompanyTrades, useCreateCompany, useDeleteCompany, useProducts, useUpdateCompany,
} from '../../lib/queries';
import { friendlyError, logoUrl } from '../../lib/supabase';
import { checkLogoFile, LOGO_ACCEPT, removeCompanyLogo, uploadCompanyLogo } from '../../lib/images';
import { money } from '../../lib/format';
import type { Company, ProductWithRefs } from '../../lib/types';
import { Button, Card, Confirm, Empty, Field, Input, PageHeader, Sheet, Skeleton } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { CompanyLogo } from '../../components/CompanyLogo';
import { ProductImage } from '../catalogue/Swatch';

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

// ---------------------------------------------------------------------
// Listing: Add Company + the active companies. Hidden ones fold away.
// ---------------------------------------------------------------------

export function CompanyList() {
  const companies = useCompanies({ includeHidden: true });
  const trades = useCompanyTrades();
  const [showHidden, setShowHidden] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    trades.data?.forEach((t) => m.set(t.company_id, (m.get(t.company_id) ?? 0) + t.product_count));
    return m;
  }, [trades.data]);

  const active = companies.data?.filter((c) => c.is_active) ?? [];
  const hidden = companies.data?.filter((c) => !c.is_active) ?? [];

  return (
    <Page>
      <PageHeader eyebrow="Catalogue" title={<>Your <em className="text-indigo">companies</em></>}>
        <Link to="/admin/companies/new"><Button icon={<Plus className="size-4" />}>Add company</Button></Link>
      </PageHeader>

      {companies.isPending ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
      ) : companies.isError ? (
        <Empty icon={<Building2 className="size-7" />} title="Couldn’t load companies" body={friendlyError(companies.error)} action={<Button variant="outline" onClick={() => companies.refetch()}>Retry</Button>} />
      ) : !active.length ? (
        <Empty icon={<Building2 className="size-7" />} title="No active companies" body="Add the brands and mills you sell. Retailers browse the catalogue company by company."
          action={<Link to="/admin/companies/new"><Button icon={<Plus className="size-4" />}>Add company</Button></Link>} />
      ) : (
        <CompanyGrid companies={active} counts={counts} />
      )}

      {hidden.length > 0 && (
        <div className="mt-10">
          <button onClick={() => setShowHidden(!showHidden)} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-mute hover:text-ink">
            {showHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showHidden ? 'Hide' : 'Show'} {hidden.length} hidden {hidden.length === 1 ? 'company' : 'companies'}
          </button>
          <AnimatePresence>
            {showHidden && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-4">
                <CompanyGrid companies={hidden} counts={counts} muted />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Page>
  );
}

function CompanyGrid({ companies, counts, muted }: { companies: Company[]; counts: Map<string, number>; muted?: boolean }) {
  return (
    <motion.ul variants={listParent} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {companies.map((c) => {
        const n = counts.get(c.id) ?? 0;
        return (
          <motion.li key={c.id} variants={listChild}>
            <Link to={`/admin/companies/${c.id}`} className="group block">
              <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
                <CompanyLogo path={c.logo_path} name={c.name} className={clsx('aspect-square w-full shadow-[var(--shadow-lift)] transition-shadow group-hover:shadow-[var(--shadow-pop)]', muted && 'opacity-60 grayscale')} />
              </motion.div>
              <p className="mt-3 truncate font-display text-lg font-medium">{c.name}</p>
              <p className="text-xs text-ink-mute">{muted ? 'Hidden from retailers' : `${n} live product${n === 1 ? '' : 's'}`}{!c.logo_path && ' · logo missing'}</p>
            </Link>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

// ---------------------------------------------------------------------
// Logo picker: choose, preview, change or remove before saving.
// ---------------------------------------------------------------------

function LogoPicker({ file, onFile, currentUrl, name, error }: { file: File | null; onFile: (f: File | null) => void; currentUrl?: string | null; name: string; error?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = checkLogoFile(f);
    if (problem) return toast.error(problem);
    onFile(f);
  };
  const shown = preview ?? currentUrl ?? null;

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={clsx('flex items-center gap-5 rounded-2xl border-2 border-dashed p-4 transition', drag ? 'border-indigo bg-indigo-100/40' : error ? 'border-madder' : 'border-line-strong')}
      >
        <AnimatePresence mode="wait">
          {shown ? (
            <motion.div key={shown} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <CompanyLogo src={shown} name={name || 'Logo'} className="size-28 shrink-0" />
            </motion.div>
          ) : (
            <motion.button key="empty" type="button" onClick={() => input.current?.click()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid size-28 shrink-0 place-items-center rounded-2xl bg-paper-2 text-ink-mute hover:text-indigo">
              <ImagePlus className="size-8" />
            </motion.button>
          )}
        </AnimatePresence>
        <div className="min-w-0 flex-1">
          {file ? (
            <p className="truncate text-sm font-semibold">{file.name} <span className="font-normal text-ink-mute">· {(file.size / 1024).toFixed(0)} KB</span></p>
          ) : (
            <p className="text-sm font-semibold">{shown ? 'Current logo' : 'Drop the logo here'}</p>
          )}
          <p className="mt-0.5 text-xs text-ink-mute">PNG, JPG or JPEG, up to 5 MB. A square logo on a plain background looks best.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" icon={shown ? <RefreshCw className="size-4" /> : <UploadCloud className="size-4" />} onClick={() => input.current?.click()}>
              {shown ? 'Change' : 'Choose image'}
            </Button>
            {file && <Button type="button" size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => onFile(null)}>Remove</Button>}
          </div>
        </div>
      </div>
      <input ref={input} type="file" accept={LOGO_ACCEPT} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="mt-1.5 text-[13px] font-medium text-madder">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Add Company
// ---------------------------------------------------------------------

export function AddCompany() {
  const navigate = useNavigate();
  const companies = useCompanies({ includeHidden: true });
  const create = useCreateCompany();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ name?: string; logo?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, ' ');
    const next: typeof errors = {};
    if (!n) next.name = 'Enter the company name.';
    else if (n.length > 80) next.name = 'Keep the name under 80 characters.';
    else if (companies.data?.some((c) => sameName(c.name, n))) next.name = 'A company with this name already exists.';
    if (!file) next.logo = 'Upload the company logo.';
    setErrors(next);
    if (next.name || next.logo || !file) return;

    setBusy(true);
    let path: string | null = null;
    try {
      path = await uploadCompanyLogo(file);
      await create.mutateAsync({ name: n, logo_path: path });
      toast.success(`${n} added`, { description: 'Retailers can see it on their home page now.' });
      navigate('/admin/companies');
    } catch (err) {
      if (path) removeCompanyLogo(path);  // don't leave an orphaned upload behind
      const msg = friendlyError(err);
      if (/already exists|in use/i.test(msg)) setErrors({ name: 'A company with this name already exists.' });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Breadcrumbs back="/admin/companies" items={[{ label: 'Companies', to: '/admin/companies' }, { label: 'Add company' }]} />
      <PageHeader eyebrow="New" title={<>Add a <em className="text-indigo">company</em></>} />
      <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <Card className="space-y-6 p-5 sm:p-6">
          <Field label="Company name" htmlFor="cname" error={errors.name}>
            <Input id="cname" value={name} autoFocus maxLength={80} invalid={!!errors.name} placeholder="e.g. Sonam Fashions"
              onChange={(e) => { setName(e.target.value); setErrors((v) => ({ ...v, name: undefined })); }} />
          </Field>
          <div className="space-y-1.5">
            <p className="text-[13px] font-semibold text-ink-soft">Company logo</p>
            <LogoPicker file={file} name={name} error={errors.logo} onFile={(f) => { setFile(f); if (f) setErrors((v) => ({ ...v, logo: undefined })); }} />
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Link to="/admin/companies"><Button type="button" variant="ghost">Cancel</Button></Link>
            <Button type="submit" loading={busy}>Save company</Button>
          </div>
        </Card>

        <div>
          <p className="label-caps mb-3">Preview · retailer home</p>
          <div className="w-48">
            <PreviewTile name={name} file={file} />
          </div>
        </div>
      </form>
    </Page>
  );
}

function PreviewTile({ name, file }: { name: string; file: File | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div>
      <CompanyLogo src={url} name={name.trim() || 'Company'} className="aspect-square w-full shadow-[var(--shadow-lift)]" />
      <p className="mt-3 truncate font-display text-lg font-medium">{name.trim() || 'Company name'}</p>
      <p className="text-xs text-ink-mute">New</p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Company details: logo, name, its products, Add Product.
// ---------------------------------------------------------------------

export function CompanyDetail() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const company = useCompany(companyId);
  const products = useProducts({ companyId, includeInactive: true }, { enabled: Boolean(companyId) });
  const update = useUpdateCompany();
  const del = useDeleteCompany();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const c = company.data;
  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !t || p.name.toLowerCase().includes(t) || p.trade?.name.toLowerCase().includes(t));
  }, [products.data, search]);
  const byTrade = useMemo(() => {
    const m = new Map<string, { name: string; items: ProductWithRefs[] }>();
    rows.forEach((p) => {
      const k = p.trade?.id ?? '-';
      if (!m.has(k)) m.set(k, { name: p.trade?.name ?? 'No trade', items: [] });
      m.get(k)!.items.push(p);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  if (company.isPending) return <Page><Skeleton className="mb-6 h-32" /><Skeleton className="h-64" /></Page>;
  if (!c) {
    return (
      <Page>
        <Empty icon={<Building2 className="size-7" />} title="Company not found" body="It may have been removed." action={<Link to="/admin/companies"><Button variant="outline">All companies</Button></Link>} />
      </Page>
    );
  }

  const toggle = () =>
    update.mutate({ id: c.id, is_active: !c.is_active }, {
      onSuccess: () => toast.success(c.is_active ? `${c.name} is hidden from retailers` : `${c.name} is visible to retailers again`),
      onError: (e) => toast.error(friendlyError(e)),
    });

  return (
    <Page>
      <Breadcrumbs back="/admin/companies" items={[{ label: 'Companies', to: '/admin/companies' }, { label: c.name }]} />

      <div className="mb-8 flex flex-wrap items-center gap-5">
        <CompanyLogo path={c.logo_path} name={c.name} className={clsx('size-24 shrink-0 shadow-[var(--shadow-lift)] sm:size-28', !c.is_active && 'opacity-60 grayscale')} />
        <div className="min-w-0 flex-1">
          <p className="label-caps">{c.is_active ? 'Visible to retailers' : 'Hidden from retailers'}</p>
          <h1 className="mt-1 truncate text-[32px] leading-tight font-medium sm:text-[40px]">{c.name}</h1>
          <p className="text-sm text-ink-mute">{products.data?.length ?? 0} products</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="ghost" size="sm" icon={c.is_active ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={toggle} loading={update.isPending}>
            {c.is_active ? 'Hide' : 'Show'}
          </Button>
          {!products.data?.length && <Button variant="ghost" size="sm" className="text-madder" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>}
        </div>
      </div>

      {!c.logo_path && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 border-marigold bg-marigold-100 p-4 text-sm text-[#6d470c]">
          <p className="flex-1 font-semibold">This company was added before logos. Upload one so retailers can recognise it.</p>
          <Button size="sm" onClick={() => setEditing(true)}>Upload logo</Button>
        </Card>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-card px-4 sm:max-w-sm">
          <Search className="size-4 text-ink-mute" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or trades" className="w-full bg-transparent text-sm focus:outline-none" />
          {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X className="size-4 text-ink-mute" /></button>}
        </label>
        <Link to={`/admin/companies/${c.id}/products/new`}><Button icon={<Plus className="size-4" />}>Add product</Button></Link>
      </div>

      {products.isPending ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : products.isError ? (
        <Empty icon={<Building2 className="size-7" />} title="Couldn’t load products" body={friendlyError(products.error)} action={<Button variant="outline" onClick={() => products.refetch()}>Retry</Button>} />
      ) : !rows.length ? (
        <Empty icon={<ImagePlus className="size-7" />} title={search ? 'No products match' : 'No products yet'}
          body={search ? 'Try another search.' : `Add ${c.name}’s first product. Retailers will be told about it on their home page.`}
          action={!search && <Link to={`/admin/companies/${c.id}/products/new`}><Button icon={<Plus className="size-4" />}>Add product</Button></Link>} />
      ) : (
        <div className="space-y-8">
          {byTrade.map((g) => (
            <section key={g.name}>
              <p className="label-caps mb-3">{g.name} · {g.items.length}</p>
              <motion.ul variants={listParent} initial="hidden" animate="show" className="space-y-2">
                {g.items.map((p) => (
                  <motion.li key={p.id} variants={listChild}>
                    <AdminProductRow product={p} onOpen={() => navigate(`/admin/companies/${c.id}/products/${p.id}`)} />
                  </motion.li>
                ))}
              </motion.ul>
            </section>
          ))}
        </div>
      )}

      {editing && <EditCompany company={c} onClose={() => setEditing(false)} />}
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} loading={del.isPending} title={`Delete ${c.name}?`} confirmLabel="Delete company"
        body="It has no products, so nothing else changes. If you might sell it again, hide it instead."
        onConfirm={() => del.mutate(c.id, {
          onSuccess: () => { removeCompanyLogo(c.logo_path); toast.success(`${c.name} deleted`); navigate('/admin/companies'); },
          onError: (e) => toast.error(friendlyError(e)),
        })} />
    </Page>
  );
}

function AdminProductRow({ product: p, onOpen }: { product: ProductWithRefs; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-card p-3 text-left transition hover:border-line-strong hover:shadow-[var(--shadow-lift)]">
      <ProductImage path={p.image_paths[0]} name={p.name} className={clsx('size-16 shrink-0', !p.is_active && 'opacity-50 grayscale')} rounded="rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-medium">{p.name}</p>
        <p className="truncate text-sm text-ink-mute">
          {p.sizes.join(' · ') || 'No sizes'}
          {p.pack_of ? ` · pack of ${p.pack_of}` : ''}
          {p.colours.length ? ` · ${p.colours.length} colour${p.colours.length === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular font-bold">{money(p.price_per_piece)}</p>
        <p className="tabular text-xs text-ink-mute">{p.mrp ? `MRP ${money(p.mrp)}` : 'No MRP'}</p>
        <p className={clsx('text-xs font-semibold', p.is_active ? 'text-leaf' : 'text-ink-mute')}>{p.is_active ? 'Live' : 'Hidden'}</p>
      </div>
    </button>
  );
}

function EditCompany({ company, onClose }: { company: Company; onClose: () => void }) {
  const companies = useCompanies({ includeHidden: true });
  const update = useUpdateCompany();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(company.name);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => { setOpen(false); window.setTimeout(onClose, 250); };

  const save = async () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return setError('Enter the company name.');
    if (companies.data?.some((c) => c.id !== company.id && sameName(c.name, n))) return setError('A company with this name already exists.');
    setBusy(true);
    let path: string | null = null;
    try {
      if (file) path = await uploadCompanyLogo(file);
      await update.mutateAsync({ id: company.id, name: n, ...(path ? { logo_path: path } : {}) });
      if (path && company.logo_path) removeCompanyLogo(company.logo_path);
      toast.success('Company updated');
      close();
    } catch (e) {
      if (path) removeCompanyLogo(path);
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Edit company" footer={
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    }>
      <div className="space-y-6">
        <Field label="Company name" htmlFor="ename" error={error}>
          <Input id="ename" value={name} maxLength={80} invalid={!!error} onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-ink-soft">Company logo</p>
          <LogoPicker file={file} onFile={setFile} name={name} currentUrl={logoUrl(company.logo_path)} />
        </div>
      </div>
    </Sheet>
  );
}
