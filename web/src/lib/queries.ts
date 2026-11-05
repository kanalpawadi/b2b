import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  AdminInvite, Announcement, Company, CompanyTrade, DashboardStats, DirectoryEntry, Notification, Order, OrderStatus, OrderWithItems,
  Product, ProductWithRefs, Trade,
} from './types';

async function unwrap<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

// Columns listed on purpose: prices (price_per_piece, mrp) aren't readable by any browser.
const PRODUCT_SELECT = 'id, company_id, trade_id, name, sku, description, image_paths, sizes, colours, pack_of, is_active, created_at, updated_at, company:companies(id,name,logo_path), trade:trades(id,name), packs:product_packs(*)';

function sortPacks(p: ProductWithRefs): ProductWithRefs {
  return { ...p, packs: [...p.packs].sort((a, b) => a.sort_order - b.sort_order) };
}

// ---------- companies ----------

/** Companies by name. RLS already hides inactive ones from retailers. */
export function useCompanies(opts: { includeHidden?: boolean } = {}) {
  return useQuery({
    queryKey: ['companies', opts],
    queryFn: async () => {
      let q = supabase.from('companies').select('*').order('name');
      if (!opts.includeHidden) q = q.eq('is_active', true);
      return unwrap<Company[]>(q);
    },
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ['companies', 'one', id],
    enabled: Boolean(id),
    queryFn: () => unwrap<Company | null>(supabase.from('companies').select('*').eq('id', id!).maybeSingle()),
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: { name: string; logo_path: string }) =>
      unwrap<Company>(supabase.from('companies').insert({ name: row.name.trim(), logo_path: row.logo_path }).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Pick<Company, 'name' | 'logo_path' | 'is_active'>>) =>
      unwrap<Company>(supabase.from('companies').update(patch).eq('id', id).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['company-trades'] });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('companies').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
}

// ---------- trades ----------

export const useTrades = () =>
  useQuery({ queryKey: ['trades'], queryFn: () => unwrap<Trade[]>(supabase.from('trades').select('*').order('name')) });

/** Trades that have live products, for one company or (no id) for every company. */
export function useCompanyTrades(companyId?: string) {
  return useQuery({
    queryKey: ['company-trades', companyId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('company_trades').select('*').order('trade_name');
      if (companyId) q = q.eq('company_id', companyId);
      return unwrap<CompanyTrade[]>(q);
    },
  });
}

export function useTradeMutations() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ['trades'] });
    qc.invalidateQueries({ queryKey: ['company-trades'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };
  return {
    create: useMutation({
      mutationFn: (name: string) => unwrap(supabase.from('trades').insert({ name: name.trim() })),
      onSuccess: done,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => unwrap(supabase.from('trades').update({ name: name.trim() }).eq('id', id)),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => unwrap(supabase.from('trades').delete().eq('id', id)),
      onSuccess: done,
    }),
  };
}

// ---------- products ----------

export interface ProductFilters {
  search?: string;
  companyId?: string | null;
  tradeId?: string | null;
  includeInactive?: boolean;
}

export function useProducts(f: ProductFilters, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['products', f],
    enabled: opts.enabled ?? true,
    queryFn: async () => {
      let q = supabase.from('products').select(PRODUCT_SELECT).order('created_at', { ascending: false }).limit(500);
      if (!f.includeInactive) q = q.eq('is_active', true);
      if (f.companyId) q = q.eq('company_id', f.companyId);
      if (f.tradeId) q = q.eq('trade_id', f.tradeId);
      const term = f.search?.trim().replace(/[%,()]/g, ' ');
      if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      const rows = await unwrap<ProductWithRefs[]>(q);
      return rows.map(sortPacks).map((p) => (f.includeInactive ? p : { ...p, packs: p.packs.filter((k) => k.is_active) }));
    },
    placeholderData: (prev) => prev,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    enabled: Boolean(id),
    queryFn: async () => sortPacks(await unwrap<ProductWithRefs>(supabase.from('products').select(PRODUCT_SELECT).eq('id', id!).single())),
  });
}

export interface ProductInput {
  company_id: string;
  /** An existing trade, or null with trade_name set to create one. */
  trade_id: string | null;
  trade_name: string | null;
  name: string;
  colours: string[];
  sizes: string[];
  image_paths: string[];
  pack_of: number;
  is_active: boolean;
}

/** Saves a product and its per-size packs in one transaction (save_product). */
export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ProductInput }) =>
      unwrap<Product>(supabase.rpc('save_product', {
        p_id: id ?? null, p_company_id: input.company_id, p_trade_id: input.trade_id, p_trade_name: input.trade_name,
        p_name: input.name, p_colours: input.colours, p_sizes: input.sizes,
        p_image_paths: input.image_paths, p_pack_of: input.pack_of, p_is_active: input.is_active,
      })),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', p.id] });
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['company-trades'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('products').delete().eq('id', id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['company-trades'] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

// ---------- announcements ----------

export function useAnnouncements(limit = 20) {
  return useQuery({
    queryKey: ['announcements', limit],
    queryFn: () =>
      unwrap<Announcement[]>(supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(limit)),
  });
}

export function usePostAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { title: string; body: string }) =>
      unwrap(supabase.from('announcements').insert({ title: a.title.trim(), body: a.body.trim() || null })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('announcements').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

// ---------- orders ----------

export function useOrders(opts: { status?: OrderStatus | 'all'; retailerId?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['orders', opts],
    queryFn: async () => {
      let q = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
      if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
      if (opts.retailerId) q = q.eq('retailer_id', opts.retailerId);
      const term = opts.search?.trim().replace(/[%,()]/g, ' ');
      if (term) {
        q = /^\d+$/.test(term)
          ? q.eq('order_number', Number(term))
          : q.or(`shop_name.ilike.%${term}%,retailer_name.ilike.%${term}%,city.ilike.%${term}%`);
      }
      return unwrap<Order[]>(q);
    },
    placeholderData: (prev) => prev,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: Boolean(id),
    queryFn: () => unwrap<OrderWithItems>(supabase.from('orders').select('*, items:order_items(*)').eq('id', id!).single()),
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { items: { pack_id: string; packs: number }[]; key: string; note: string }) =>
      unwrap<Order>(supabase.rpc('create_order', { p_items: args.items, p_idempotency_key: args.key, p_note: args.note || null })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSetOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status: Exclude<OrderStatus, 'placed'>; reason?: string }) =>
      unwrap<Order>(supabase.rpc('set_order_status', { p_order_id: args.id, p_status: args.status, p_reason: args.reason ?? null })),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', o.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---------- admin ----------

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => unwrap<DashboardStats>(supabase.rpc('dashboard_stats')), refetchInterval: 60_000 });

export function useDirectory() {
  return useQuery({
    queryKey: ['directory'],
    queryFn: () => unwrap<DirectoryEntry[]>(supabase.from('user_directory').select('*').order('created_at', { ascending: false })),
  });
}

export function useDirectoryEntry(id: string | undefined) {
  return useQuery({
    queryKey: ['directory', id],
    enabled: Boolean(id),
    queryFn: () => unwrap<DirectoryEntry>(supabase.from('user_directory').select('*').eq('id', id!).single()),
  });
}

export function useSetAccountStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'blocked' }) =>
      unwrap(supabase.from('profiles').update({ status }).eq('id', id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['directory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Permanently removes a paused account (admin_delete_account). Orders are kept. */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.rpc('admin_delete_account', { p_id: id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['directory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** Emails the super admin has added as admins who haven't signed up yet. */
export function useAdminInvites(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-invites'],
    enabled,
    queryFn: () => unwrap<AdminInvite[]>(supabase.from('admin_invites').select('*').order('created_at', { ascending: false })),
  });
}

export function useInviteAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => unwrap<'invited' | 'promoted' | 'approved'>(supabase.rpc('invite_admin', { p_email: email })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-invites'] });
      qc.invalidateQueries({ queryKey: ['directory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => unwrap(supabase.from('admin_invites').delete().eq('email', email)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-invites'] }),
  });
}

// ---------- notifications ----------

export function useNotifications(uid: string | undefined) {
  return useQuery({
    queryKey: ['notifications', uid],
    enabled: Boolean(uid),
    queryFn: () =>
      unwrap<Notification[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
  });
}

export function useMarkAllRead(uid: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('user_id', uid!)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', uid] }),
  });
}
