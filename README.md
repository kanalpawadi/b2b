# Mukesh Sales Corporation — B2B Ordering (web)

A wholesale ordering web app for retailers and the Mukesh Sales back office,
which distributes ladies’ and gents’ innerwear and nightwear.
**React + Vite** in the browser, **Supabase** (Postgres, Auth, Storage, Realtime)
as the whole backend. There is no separate server: every business rule lives in
the database as Row Level Security policies and SQL functions.

```
supabase/
  config.toml                      local CLI config (phone sign-up on)
  migrations/                      schema, RLS, RPCs and storage, applied in name order
web/
  src/lib/          supabase client, typed queries, cart store, formatting
  src/components/   UI kit, motion helpers, app shells
  src/features/     auth · catalogue · cart · orders · notifications · about · account · admin
  public/brand/     the MSC logo (as supplied, plus a cropped transparent copy and icons)
```

## What it does

**Retailers** sign up with **email and password**. On their first visit they enter their
shop details once (shop name, mobile, GSTIN, area, city and state), and ordering
stays locked until they do. They browse the catalogue, add **packs** (for
example 2 packs of size M, 6 pieces each) to a cart that is saved per user, and
place orders. Each order comes with a PDF invoice (downloaded automatically
after placing it, and again any time from the order page). They can then
track and cancel open orders, read alerts, edit their details and delete their
account.

The catalogue is browsed **company first**: the home page shows the active
companies (each with its uploaded logo) and a feed of latest updates, a company
page lists its trades with a search box, and a trade page shows every design in
it (photos, colours, sizes, pack size) with ordering right there:
each size is sold in packs of the product's "pack of" count. There is also an
About Us page.

**Admins** get:
- a dashboard: open orders, today's orders, this month's value, a 14-day chart and best sellers
- an order board where they complete or cancel orders
- company management: add a company (name + logo upload), open it to see its products, add or edit
  products (name, trade, colours, any sizes, image URLs or uploads, pack of), hide or show a company
- alerts on the dashboard when companies or products are added, and a box to post updates to every retailer's home page
- people management: retailer history, pausing and restoring accounts, deleting a paused account, approving admins
- live alerts

**Admin access** is hidden. On the sign-in screen, press and hold the logo (on
desktop, the small dot at the top right) to reveal it, then use **Request admin access** with an email that isn't a
retailer account. Someone who signed up as a retailer by mistake can tap
"I'm staff, not a retailer" on the shop-details screen instead. The first person
to do this becomes the **owner** automatically, and every later admin waits for
the owner's approval.

## How the rules are enforced

| Rule | Where |
|---|---|
| Who can read or write each table | RLS policies plus explicit column grants |
| Order snapshots | `create_order()` copies product, company and pack details onto each line, so later edits never change a placed order |
| No double orders | Idempotency key per checkout, `unique (retailer_id, idempotency_key)` |
| Order states | `set_order_status()`: placed → completed or cancelled, with no way back |
| Nobody can promote themselves | `protect_profile` trigger, and `role` can't be updated at all |
| Paused users | Every policy checks `is_active_user()` |
| Audit trail | Triggers write `audit_logs` on every catalogue, order and profile change |
| Products | `save_product()` validates and writes a product and its per-size packs in one transaction; no duplicate name within a company's trade |
| Companies | Logo required for new companies, names unique ignoring case; retailers only ever see active companies (RLS) |
| Updates | Adding a company or product posts one `announcements` row (and alerts admins) from a trigger, so a failed save never announces |
| Photos & logos | Re-encoded to WebP in the browser (which strips EXIF/GPS); buckets `product-images` (5 MB) and `company-logos` (2 MB) accept only images, and only admins can write |
| Stock | Not tracked. The app is a catalogue plus ordering |
| Prices | None anywhere: products have no rate or MRP, orders store packs and pieces only, and no browser can read prices stored before this change (column privileges) |
| Super admin | The owner (`is_owner`) is the super admin: only they approve or add admins (`invite_admin()`; invited emails become admins on sign-up) |
| Browser security | `web/vercel.json` sets a Content-Security-Policy, HSTS, no framing, no MIME sniffing |
| Deleting accounts | `admin_delete_account()`: only a paused account, never the owner, admins only by the owner; orders are kept with their shop snapshot |
| Invoices | Built in the browser from the order (HTML → PDF with jsPDF): one row per design with its sizes as columns, packs and total quantity; no amounts |

## Setup

### 1. Create the Supabase project
1. Create a project at supabase.com. The region nearest your users is **Mumbai (ap-south-1)**.
2. Apply the schema with **either**:
   - the CLI (from this folder):
     ```bash
     npx supabase link --project-ref <your-ref>
     ```
     ```bash
     npx supabase db push
     ```
   - or paste each file in `supabase/migrations/` into **SQL Editor** and run them **in name order**:
     `20261102000000_init.sql`, then `20261103000000_google_sign_in.sql`, then
     `20261104000000_company_navigation.sql`, then `20261105000000_admin_delete_account.sql`, then
     `20261106000000_orders_without_prices.sql`, then `20261107000000_no_mrp.sql`, then
     `20261108000000_super_admin.sql`.

### 2. Email sign-in
In **Authentication → Sign In / Providers → Email**, keep **Email** on.
- **Confirm email**: while it's on, every sign-up must click a link in their
  inbox. Supabase's built-in mailer **only delivers to members of your Supabase
  team** and sends just a few emails per hour, so either:
  - turn **Confirm email** off while testing, or
  - add your own SMTP under **Authentication → Emails → SMTP Settings**
    (Resend, Brevo, Zoho, Gmail SMTP…) before real retailers sign up.
- In **Authentication → URL Configuration**:
  - Set **Site URL** to your live address, e.g. `https://your-app.vercel.app`
    (no slash at the end). If this still says localhost, every email link opens
    `localhost` on the retailer's phone.
  - Under **Redirect URLs** add `https://your-app.vercel.app/**`, plus
    `http://localhost:5173/**` if you also test locally.
- In **Authentication → Emails → Templates**, point the links at `/auth/confirm`
  so they work on any device or mail app (the default links only work in the
  browser that asked for them):
  - **Confirm signup**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  - **Reset password**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- Recommended before launch, in **Authentication**: minimum password length 8,
  **leaked password protection** on, and a CAPTCHA (Turnstile or hCaptcha) on
  sign-up if spam accounts appear.

**Google sign-in (optional, later)** is built but switched off. To use it, set up
the Google provider in Supabase (an OAuth client from Google Cloud with
`https://<your-ref>.supabase.co/auth/v1/callback` as its redirect URI), then add
`VITE_ENABLE_GOOGLE=true` to `web/.env.local`. A "Continue with Google"
button then appears under the email form.

### 3. Run the web app
```bash
cd web
```
```bash
npm install
```
Copy `web/.env.example` to `web/.env.local` and fill in the project URL and the
publishable (anon) key from **Project Settings → API**. Never use the
service-role key here.
```bash
npm run dev
```
Open http://localhost:5173, register the first admin through the hidden staff
link (that person becomes the **super admin**), then add your companies (with
logos) under **Companies** and their products. The super admin adds more admins
under **People → Admins → Add an admin**.
Trades can be created while adding a product, and renamed under `/admin/trades`.

### Checks
```bash
npm run typecheck
```
```bash
npm test
```
```bash
npm run build
```

## Deploying
`web` is a static site: run `npm run build`, then host `dist/` on Vercel,
Netlify or Cloudflare Pages. Add a SPA fallback that rewrites all routes to
`/index.html`, and set the two `VITE_` variables in the host's environment.
Also add the deployed URL to **Authentication → URL Configuration**.

## Not built yet
- **TallyPrime sync.** Planned as an Edge Function or worker that reads completed orders.
- **Email alerts to the owner** for admin requests. The owner gets an in-app alert today; sending an email needs an Edge Function.
- **Clean-up of abandoned sign-ups** (accounts that never confirmed their email or entered shop details). This is a small `pg_cron` job.
- **Database tests** (pgTAP) for the RLS policies and RPCs, and a CI workflow.
- **Dark mode.**
