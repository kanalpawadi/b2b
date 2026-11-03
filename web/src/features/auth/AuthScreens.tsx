import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { z } from 'zod';
import { ArrowRight, Eye, EyeOff, LogOut, MailCheck, ShieldCheck, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { GOOGLE_ENABLED, STAFF_INTENT_KEY, friendlyError, setStaffIntent, signInWithGoogle, supabase } from '../../lib/supabase';
import { toE164 } from '../../lib/format';
import { Button, Field, FullScreenLoader, Input, Select } from '../../components/ui';
import { AuthLayout } from './AuthLayout';
import { useAuth, useMe } from './AuthProvider';
import { STATES } from './states';

type Errors = Record<string, string | undefined>;

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z.string().min(8, 'Use at least 8 characters').max(72, 'That is too long');

function collect(err: z.ZodError): Errors {
  const out: Errors = {};
  for (const i of err.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const slide = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -28 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
};

function PasswordInput(props: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={props.id} type={show ? 'text' : 'password'} value={props.value} onChange={(e) => props.onChange(e.target.value)} invalid={props.invalid} autoComplete={props.autoComplete} className="pr-12" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-mute hover:text-ink">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Google (kept for later; shown only when VITE_ENABLE_GOOGLE=true)

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GoogleOption({ staff }: { staff?: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!GOOGLE_ENABLED) return null;
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs font-semibold tracking-wider text-ink-mute uppercase">
        <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signInWithGoogle({ staff });
          } catch (e) {
            toast.error(friendlyError(e));
            setBusy(false);
          }
        }}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-card font-semibold transition hover:border-indigo disabled:opacity-60"
      >
        <GoogleLogo /> Continue with Google
      </button>
    </>
  );
}

// ---------------------------------------------------------------------

function CheckInbox({ address, kind, onBack }: { address: string; kind: 'signup' | 'reset'; onBack: () => void }) {
  const [sending, setSending] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);
  return (
    <motion.div key="inbox" {...slide} className="space-y-6">
      <motion.div
        initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="grid size-16 place-items-center rounded-2xl bg-leaf text-white shadow-[var(--shadow-pop)]"
      >
        <MailCheck className="size-8" />
      </motion.div>
      <p className="text-[15px] leading-relaxed text-ink-soft">
        We sent a link to <span className="font-semibold text-ink">{address}</span>.{' '}
        {kind === 'signup' ? 'Open it on this device to confirm your email and sign in.' : 'Open it on this device to choose a new password.'}
      </p>
      <p className="text-[13px] text-ink-mute">Can’t see it? Check Spam or Promotions. It can take a minute to arrive.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={onBack}>Use a different email</Button>
        {kind === 'signup' && (
          <Button
            variant="ghost"
            loading={sending}
            disabled={sentAgain}
            onClick={async () => {
              setSending(true);
              const { error } = await supabase.auth.resend({ type: 'signup', email: address, options: { emailRedirectTo: window.location.origin } });
              setSending(false);
              if (error) return toast.error(friendlyError(error));
              setSentAgain(true);
              toast.success('Sent again.');
            }}
          >
            {sentAgain ? 'Link sent again' : 'Send the link again'}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------

export function SignIn() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = z.object({ email, password: z.string().min(1, 'Enter your password') }).safeParse(form);
    if (!parsed.success) return setErrors(collect(parsed.error));
    setErrors({});
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) toast.error(friendlyError(error));
  };

  return (
    <AuthLayout
      title={<>Welcome <em className="text-indigo">back.</em></>}
      subtitle="Sign in with the email linked to your shop."
      footer={<>New to us? <Link to="/register" className="font-semibold text-indigo hover:underline">Register your shop</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <PasswordInput id="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} invalid={!!errors.password} autoComplete="current-password" />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot" className="text-sm font-semibold text-ink-soft hover:text-indigo">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Sign in <ArrowRight className="size-4" />
        </Button>
      </form>
      <GoogleOption />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------

/** Account creation for retailers, and (staff) for admin requests. */
function SignUpForm({ staff }: { staff?: boolean }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = z.object({ full_name: z.string().trim().min(2, 'Enter your full name').max(80), email, password }).safeParse(form);
    if (!parsed.success) return setErrors(collect(parsed.error));
    setErrors({});
    setBusy(true);
    setStaffIntent(Boolean(staff));
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    // With "Confirm email" off the user is signed in straight away; the
    // router then takes them to shop details (or the staff request).
    if (!data.session) setSentTo(parsed.data.email);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {sentTo ? (
        <CheckInbox address={sentTo} kind="signup" onBack={() => setSentTo(null)} />
      ) : (
        <motion.form key="form" {...slide} onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Your name" htmlFor="full_name" error={errors.full_name}>
            <Input id="full_name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} invalid={!!errors.full_name} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email} hint={staff ? 'Use your work email.' : 'Order updates and receipts go here.'}>
            <Input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} />
          </Field>
          <Field label="Create a password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
            <PasswordInput id="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} invalid={!!errors.password} autoComplete="new-password" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {staff ? 'Request access' : 'Create account'} <ArrowRight className="size-4" />
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}

export function Register() {
  return (
    <AuthLayout
      title={<>Open a <em className="text-indigo">trade</em> account.</>}
      subtitle="Takes about a minute. Next we’ll ask for your shop details once."
      footer={<>Already registered? <Link to="/sign-in" className="font-semibold text-indigo hover:underline">Sign in</Link></>}
    >
      <SignUpForm />
      <GoogleOption />
    </AuthLayout>
  );
}

export function AdminJoin() {
  return (
    <AuthLayout
      title={<>Staff <em className="text-indigo">access.</em></>}
      subtitle="The owner approves every new admin. The very first admin of a new shop is approved automatically."
      footer={<Link to="/sign-in" className="font-semibold text-indigo hover:underline">← Back to sign in</Link>}
    >
      <SignUpForm staff />
      <GoogleOption staff />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------

export function ForgotPassword() {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = email.safeParse(address);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (err) return toast.error(friendlyError(err));
    setSentTo(parsed.data);
  };

  return (
    <AuthLayout
      title={<>Reset your <em className="text-indigo">password.</em></>}
      subtitle={sentTo ? undefined : 'We’ll email you a link to choose a new one.'}
      footer={<Link to="/sign-in" className="font-semibold text-indigo hover:underline">← Back to sign in</Link>}
    >
      <AnimatePresence mode="wait" initial={false}>
        {sentTo ? (
          <CheckInbox address={sentTo} kind="reset" onBack={() => setSentTo(null)} />
        ) : (
          <motion.form key="form" {...slide} onSubmit={submit} className="space-y-5" noValidate>
            <Field label="Email" htmlFor="email" error={error}>
              <Input id="email" type="email" inputMode="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} invalid={!!error} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy}>Email me a link</Button>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

/** Where the reset email lands: the link has already signed the user in. */
export function ResetPassword() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  if (!session) {
    return (
      <AuthLayout title={<>Link <em className="text-indigo">expired.</em></>} subtitle="That reset link has expired or was already used. Ask for a new one."
        footer={<Link to="/forgot" className="font-semibold text-indigo hover:underline">Send a new link</Link>}>
        <span />
      </AuthLayout>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = password.safeParse(pwd);
    if (!r.success) return setError(r.error.issues[0]?.message);
    setError(undefined);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (err) return toast.error(friendlyError(err));
    toast.success('Password updated.');
    navigate('/', { replace: true });
  };

  return (
    <AuthLayout title={<>Choose a new <em className="text-indigo">password.</em></>} subtitle={session.user.email ?? undefined}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="New password" htmlFor="pwd" error={error} hint="At least 8 characters.">
          <PasswordInput id="pwd" value={pwd} onChange={setPwd} invalid={!!error} autoComplete="new-password" />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Save and continue</Button>
      </form>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------

/** Turns a brand-new account into an admin request (first one becomes owner). */
export function StaffRequest() {
  const { refreshProfile, signOut } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const { error: err } = await supabase.rpc('request_admin_access');
      setStaffIntent(false);
      if (err) return setError(friendlyError(err));
      await qc.invalidateQueries({ queryKey: ['me'] });
      await refreshProfile();
    })();
  }, [qc, refreshProfile]);

  if (!error) return <FullScreenLoader />;
  return (
    <AuthLayout title={<>Couldn’t request <em className="text-indigo">access.</em></>} subtitle={error}>
      <Button variant="outline" icon={<LogOut className="size-4" />} onClick={signOut}>Sign out and use another email</Button>
    </AuthLayout>
  );
}

export function wantsStaffAccess() {
  try {
    return localStorage.getItem(STAFF_INTENT_KEY) === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------

const shopSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(80),
  phone: z.string().refine((v) => toE164(v) !== null, 'Enter a 10-digit Indian mobile number'),
  shop_name: z.string().trim().min(2, 'Enter your shop name').max(120),
  gst_number: z.string().trim().toUpperCase().refine((v) => !v || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), 'A GSTIN is 15 characters, e.g. 27ABCDE1234F1Z5'),
  area: z.string().trim().max(120),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  state: z.string().min(2, 'Choose your state'),
});

/** First visit after sign-up: the shop details we need before ordering. */
export function Onboarding() {
  const me = useMe();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: me.full_name, phone: '', shop_name: '', gst_number: '', area: '', city: '', state: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = shopSchema.safeParse(form);
    if (!parsed.success) return setErrors(collect(parsed.error));
    setErrors({});
    setBusy(true);
    const d = parsed.data;
    const { error } = await supabase.rpc('complete_onboarding', {
      p_full_name: d.full_name, p_shop_name: d.shop_name, p_phone: toE164(d.phone), p_gst_number: d.gst_number || null,
      p_area: d.area || null, p_city: d.city, p_state: d.state,
    });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success('Welcome aboard! Your shop is set up.');
    await qc.invalidateQueries({ queryKey: ['me'] });
  };

  const askForStaff = () => {
    setStaffIntent(true);
    window.location.reload();
  };

  return (
    <AuthLayout
      title={<>Tell us about your <em className="text-indigo">shop.</em></>}
      subtitle={<>Signed in as <span className="font-semibold text-ink">{me.email}</span>. This is asked only once.</>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={signOut} className="font-semibold text-ink-soft hover:text-ink">Not you? Sign out</button>
          <button onClick={askForStaff} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-mute hover:text-indigo">
            <ShieldCheck className="size-4" /> I’m staff, not a retailer
          </button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-100 text-indigo"><Store className="size-5" /></span>
          <p className="text-[13.5px] text-ink-soft">These appear on your orders and invoices, so please use your registered business details.</p>
        </div>
        <Field label="Your name" htmlFor="full_name" error={errors.full_name}>
          <Input id="full_name" autoComplete="name" value={form.full_name} onChange={set('full_name')} invalid={!!errors.full_name} />
        </Field>
        <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="The office calls this number about deliveries.">
          <Input id="phone" prefix="+91" inputMode="tel" autoComplete="tel-national" value={form.phone} onChange={set('phone')} invalid={!!errors.phone} />
        </Field>
        <div className="stitch" />
        <Field label="Shop name" htmlFor="shop_name" error={errors.shop_name}>
          <Input id="shop_name" autoComplete="organization" value={form.shop_name} onChange={set('shop_name')} invalid={!!errors.shop_name} />
        </Field>
        <Field label="GSTIN (optional)" htmlFor="gst" error={errors.gst_number}>
          <Input id="gst" className="uppercase" maxLength={15} value={form.gst_number} onChange={set('gst_number')} invalid={!!errors.gst_number} />
        </Field>
        <Field label="Area / market" htmlFor="area" error={errors.area}>
          <Input id="area" value={form.area} onChange={set('area')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" htmlFor="city" error={errors.city}>
            <Input id="city" autoComplete="address-level2" value={form.city} onChange={set('city')} invalid={!!errors.city} />
          </Field>
          <Field label="State" htmlFor="state" error={errors.state}>
            <Select id="state" value={form.state} onChange={set('state')}>
              <option value="">Choose…</option>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Start ordering <ArrowRight className="size-4" />
        </Button>
      </form>
    </AuthLayout>
  );
}
