import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string | undefined;

export const isConfigured = Boolean(url && key && !url.includes('your-project-ref'));

// When the env is missing the app renders a setup screen instead of
// crashing, so the client is created against a harmless placeholder.
export const supabase = createClient(
  isConfigured ? url! : 'http://localhost:54321',
  isConfigured ? key! : 'not-configured',
  // PKCE + detectSessionInUrl: Google redirects back with ?code=…, which the
  // client exchanges for a session on load.
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } },
);

/** Google sign-in is built but switched off until the OAuth client is set up. */
export const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE === 'true';

/** Remembers, across a redirect or email link, that this sign-up is a staff request. */
export const STAFF_INTENT_KEY = 'msc.staff-request';

export function setStaffIntent(staff: boolean) {
  try {
    if (staff) localStorage.setItem(STAFF_INTENT_KEY, '1');
    else localStorage.removeItem(STAFF_INTENT_KEY);
  } catch {
    /* storage blocked: staff can still ask from the shop-details screen */
  }
}

export async function signInWithGoogle(opts: { staff?: boolean } = {}) {
  setStaffIntent(Boolean(opts.staff));
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export const PRODUCT_BUCKET = 'product-images';
export const LOGO_BUCKET = 'company-logos';

export const isWebUrl = (path: string) => /^https?:\/\//i.test(path);

/** Product images are either uploaded (a storage path) or a pasted web address. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (isWebUrl(path)) return path;
  return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Turn a PostgREST / Auth error into something a shopkeeper can read. */
export function friendlyError(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (!message) return 'Something went wrong. Please try again.';
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first. Check your inbox for our link.';
  if (/user already registered|already been registered/i.test(message)) return 'This email already has an account. Sign in instead.';
  if (/password should be|weak password/i.test(message)) return 'Choose a stronger password (at least 8 characters).';
  if (/same.*password|different from the old/i.test(message)) return 'Choose a password you haven’t used here before.';
  if (/provider is not enabled|unsupported provider/i.test(message)) return 'Google sign-in isn’t switched on for this project yet.';
  if (/access_denied|cancel/i.test(message)) return 'Google sign-in was cancelled.';
  if (/token has expired|otp.*(expired|invalid)|invalid.*(otp|token)|email link is invalid/i.test(message)) return 'That link has expired or was already used. Ask for a new one.';
  if (/code verifier|auth code and code verifier/i.test(message)) return 'Open the link in the same browser you used to sign up, or ask for a new link.';
  if (/failed to fetch|network/i.test(message)) return 'Can’t reach the server. Check your internet connection.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/companies_name_ci|companies_name_key/i.test(message)) return 'A company with this name already exists.';
  if (/duplicate key/i.test(message)) return 'That name is already in use.';
  if (/payload too large|exceeded the maximum allowed size/i.test(message)) return 'That image is too large. Try a smaller file.';
  if (/mime type .* is not supported|invalid mime/i.test(message)) return 'Choose a PNG or JPG image.';
  if (/violates foreign key.*restrict|still referenced/i.test(message)) return 'This is still used by products, so it can’t be removed.';
  if (/database error saving new user/i.test(message)) return 'Some details look wrong. Please check them and try again.';
  return message;
}
