// Row shapes for the tables in supabase/migrations. Once the project is
// linked these can be replaced with `supabase gen types typescript`.

export type UserRole = 'retailer' | 'admin';
export type AccountStatus = 'pending' | 'active' | 'blocked';
export type OrderStatus = 'placed' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  role: UserRole;
  status: AccountStatus;
  is_owner: boolean;
  full_name: string;
  phone: string | null;
  email: string | null;
  shop_name: string | null;
  gst_number: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  verified_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectoryEntry extends Profile {
  order_count: number;
  last_order_at: string | null;
  pieces_ordered: number;
  packs_ordered: number;
}

export interface AdminInvite {
  email: string;
  invited_by: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  /** Storage path in the company-logos bucket. Only companies made before logos existed lack one. */
  logo_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  name: string;
  created_at: string;
}

/** A trade as it appears under one company (the company_trades view). */
export interface CompanyTrade {
  company_id: string;
  trade_id: string;
  trade_name: string;
  product_count: number;
  cover_image: string | null;
  search_text: string;
  latest_at: string;
}

export interface PackLine {
  size: string;
  qty: number;
}

export interface Pack {
  id: string;
  product_id: string;
  label: string;
  composition: PackLine[];
  pieces: number;
  is_active: boolean;
  sort_order: number;
}

export interface Product {
  id: string;
  company_id: string;
  trade_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  /** Storage paths of uploaded photos, or full http(s) image URLs. */
  image_paths: string[];
  sizes: string[];
  colours: string[];
  /** Pieces in one pack; each size is sold in packs of this many. */
  pack_of: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductWithRefs extends Product {
  company: Pick<Company, 'id' | 'name' | 'logo_path'> | null;
  trade: Pick<Trade, 'id' | 'name'> | null;
  packs: Pack[];
}

export interface Order {
  id: string;
  order_number: number;
  retailer_id: string | null;
  status: OrderStatus;
  note: string | null;
  retailer_name: string;
  shop_name: string | null;
  retailer_phone: string | null;
  city: string | null;
  total_pieces: number;
  cancel_reason: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  pack_id: string | null;
  product_name: string;
  company_name: string;
  sku: string | null;
  image_path: string | null;
  pack_label: string;
  composition: PackLine[];
  pieces_per_pack: number;
  packs: number;
  line_pieces: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface Notification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  order_id: string | null;
  company_id: string | null;
  product_id: string | null;
  read_at: string | null;
  created_at: string;
}

export type AnnouncementKind = 'company_added' | 'product_added' | 'announcement';

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  company_id: string | null;
  trade_id: string | null;
  product_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DashboardStats {
  orders_today: number;
  open_orders: number;
  month_orders: number;
  month_packs: number;
  month_pieces: number;
  retailers: number;
  pending_admins: number;
  daily: { day: string; orders: number; pieces: number }[];
  top_products: { product_name: string; company_name: string; pieces: number; packs: number }[];
}
