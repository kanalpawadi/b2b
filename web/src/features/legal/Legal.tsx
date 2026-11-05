import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BRAND, Wordmark } from '../../components/Brand';
import { Page } from '../../components/motion';

// Public pages Google's sign-in screen links to (and anyone can open). They
// describe what this app actually stores; keep them in step with the schema.

const UPDATED = '5 November 2026';

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line/70 bg-paper/85">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="Home"><Wordmark /></Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> Home</Link>
        </div>
      </header>
      <Page className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="label-caps">Last updated {UPDATED}</p>
        <h1 className="mt-2 text-[34px] leading-tight font-medium sm:text-[44px]">{title}</h1>
        <div className="mt-8 space-y-8 text-[15.5px] leading-relaxed text-ink-soft [&_h2]:mb-2 [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
        <p className="mt-12 text-sm text-ink-mute">
          See also: <Link to="/privacy" className="font-semibold text-indigo hover:underline">Privacy Policy</Link> · <Link to="/terms" className="font-semibold text-indigo hover:underline">Terms of Use</Link>
        </p>
      </Page>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what {BRAND.name} (“we”, “us”) collects through this ordering app, why, and the choices you have.
        The app is for retailers who buy ladies’ and gents’ innerwear and nightwear from us wholesale, and for our staff.
      </p>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><b>Account details:</b> your name and email address. If you sign in with Google, we receive only your name and email from Google. If you use a password, it is stored securely by our sign-in provider and never seen by us.</li>
          <li><b>Shop details you enter:</b> shop name, mobile number, GSTIN (optional), area, city and state.</li>
          <li><b>Orders:</b> what you order (designs, sizes, packs and quantities), any note you add, and the order’s status.</li>
          <li><b>Sign-in session:</b> your browser keeps you signed in. We do not use advertising or tracking cookies, and we do not run analytics on you.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To run your trade account and show you our catalogue.</li>
          <li>To receive, pack and dispatch your orders, and to contact you about them.</li>
          <li>To send account emails, such as confirming your email address or resetting a password.</li>
          <li>To keep the app secure and prevent misuse.</li>
        </ul>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <p>We do not sell your information. It is handled only by the services that run the app for us:</p>
        <ul>
          <li><b>Supabase</b> for the database and sign-in.</li>
          <li><b>Vercel</b> for hosting the website.</li>
          <li><b>Google</b> only if you choose “Continue with Google”.</li>
          <li>Our <b>email delivery provider</b>, to send account emails.</li>
        </ul>
        <p>We may also share information when the law requires it.</p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>
          We keep your account while it is active. If your account is deleted, your sign-in and profile are removed. Past orders are kept,
          with the shop details recorded at the time, because we need them for our business and tax records.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Update your shop details at any time on the <b>Account</b> page.</li>
          <li>Delete your account yourself from the <b>Account</b> page, or ask us to do it.</li>
          <li>Ask us what we hold about you, or to correct it.</li>
        </ul>
      </section>
      <section>
        <h2>Security</h2>
        <p>All connections are encrypted. Each retailer can see only their own account and orders, and only our approved staff can manage the catalogue and orders.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>For any privacy question or request, contact {BRAND.name} directly, or use the support email shown on the Google sign-in screen.</p>
      </section>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Use">
      <p>These terms apply to the {BRAND.name} ordering app. By creating an account or placing an order, you agree to them.</p>
      <section>
        <h2>Trade accounts</h2>
        <ul>
          <li>The app is for retailers and businesses buying from us wholesale.</li>
          <li>Give accurate shop details and keep your sign-in private. You are responsible for orders placed from your account.</li>
          <li>We may pause or close an account that is misused or gives false details.</li>
        </ul>
      </section>
      <section>
        <h2>Orders</h2>
        <ul>
          <li>An order placed in the app is a request to buy. It is confirmed when we accept and pack it.</li>
          <li>Designs, sizes and availability can change. If something can’t be supplied, we will tell you and may cancel that order.</li>
          <li>You can cancel an order while it is still open.</li>
          <li>Prices, taxes and freight are confirmed by us on the final bill for each order.</li>
        </ul>
      </section>
      <section>
        <h2>Using the app</h2>
        <ul>
          <li>Don’t try to access other people’s accounts or data, or interfere with the app.</li>
          <li>Catalogue photos and content belong to us or to the brands we distribute.</li>
        </ul>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We may update the app and these terms. The date at the top shows the latest version.</p>
      </section>
      <section>
        <h2>Law</h2>
        <p>These terms are governed by the laws of India.</p>
      </section>
    </LegalPage>
  );
}
