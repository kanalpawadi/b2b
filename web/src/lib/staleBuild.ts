// After a deploy, a tab that was already open still points at the previous
// build's file names. Loading a lazily-loaded part (the invoice, the PDF
// libraries) then fails. The fix is to load the new version once.

const KEY = 'msc.reloaded-for-update';

/** True for "this part of the app no longer exists on the server" errors. */
export function isStaleBuildError(error: unknown): boolean {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error ?? '');
  return /dynamically imported module|importing a module script failed|error loading dynamically imported|loading (css )?chunk|preload/i.test(message);
}

/**
 * Reloads into the latest version, at most once a minute so a genuine outage
 * can't cause a reload loop. Returns false when it chose not to reload.
 */
export function reloadForNewVersion(to?: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: still reload once; the guard just can't persist */
  }
  if (to) window.location.assign(to);
  else window.location.reload();
  return true;
}
