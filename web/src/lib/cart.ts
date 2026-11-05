import { useSyncExternalStore } from 'react';

// The cart lives in the browser. It holds no prices: Mukesh Sales prices
// orders in its own billing, and create_order stores packs and pieces only.

export interface CartLine {
  packId: string;
  productId: string;
  productName: string;
  companyName: string;
  packLabel: string;
  packSummary: string;
  piecesPerPack: number;
  imagePath: string | null;
  packs: number;
}

interface CartState {
  lines: CartLine[];
  note: string;
  /** Reused across retries of one checkout so a double submit can't make two orders. */
  checkoutKey: string | null;
}

const MAX_PACKS = 9999;
const empty: CartState = { lines: [], note: '', checkoutKey: null };

let owner: string | null = null;
let state: CartState = empty;
const listeners = new Set<() => void>();

const storageKey = (uid: string) => `msc.cart.${uid}`;

function emit() {
  if (owner) {
    try {
      localStorage.setItem(storageKey(owner), JSON.stringify(state));
    } catch {
      /* private mode: the cart just won't survive a reload */
    }
  }
  listeners.forEach((l) => l());
}

function set(next: Partial<CartState>) {
  state = { ...state, ...next };
  emit();
}

export const cart = {
  /** Each signed-in user gets their own saved cart. */
  bindTo(uid: string | null) {
    if (uid === owner) return;
    owner = uid;
    state = empty;
    if (uid) {
      try {
        const raw = localStorage.getItem(storageKey(uid));
        if (raw) state = { ...empty, ...(JSON.parse(raw) as CartState) };
      } catch {
        state = empty;
      }
    }
    listeners.forEach((l) => l());
  },

  add(line: Omit<CartLine, 'packs'>, packs: number) {
    const existing = state.lines.find((l) => l.packId === line.packId);
    const lines = existing
      ? state.lines.map((l) => (l.packId === line.packId ? { ...l, packs: Math.min(MAX_PACKS, l.packs + packs) } : l))
      : [...state.lines, { ...line, packs: Math.min(MAX_PACKS, packs) }];
    set({ lines, checkoutKey: null });
  },

  setPacks(packId: string, packs: number) {
    if (packs <= 0) return cart.remove(packId);
    set({
      lines: state.lines.map((l) => (l.packId === packId ? { ...l, packs: Math.min(MAX_PACKS, Math.floor(packs)) } : l)),
      checkoutKey: null,
    });
  },

  remove(packId: string) {
    set({ lines: state.lines.filter((l) => l.packId !== packId), checkoutKey: null });
  },

  setNote(note: string) {
    set({ note: note.slice(0, 500) });
  },

  checkoutKey(): string {
    if (!state.checkoutKey) set({ checkoutKey: crypto.randomUUID() });
    return state.checkoutKey!;
  },

  clear() {
    set({ ...empty });
  },

  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => state,
};

export function useCart() {
  return useSyncExternalStore(cart.subscribe, cart.snapshot);
}

export function cartTotals(lines: CartLine[]) {
  return lines.reduce(
    (t, l) => {
      const pieces = l.piecesPerPack * l.packs;
      return { packs: t.packs + l.packs, pieces: t.pieces + pieces };
    },
    { packs: 0, pieces: 0 },
  );
}
