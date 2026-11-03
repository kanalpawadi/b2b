import { beforeEach, describe, expect, it } from 'vitest';
import { cart, cartTotals } from './cart';

const line = {
  packId: 'p1',
  productId: 'prod1',
  productName: 'Cotton rib vest',
  companyName: 'Acme',
  packLabel: 'Size 85',
  packSummary: 'S×1 · M×2',
  piecesPerPack: 3,
  pricePerPiece: 250,
  imagePath: null,
};

describe('cart', () => {
  beforeEach(() => {
    cart.bindTo(null);
    cart.bindTo('user-a');
    cart.clear();
  });

  it('merges repeat adds of the same pack', () => {
    cart.add(line, 2);
    cart.add(line, 3);
    expect(cart.snapshot().lines).toHaveLength(1);
    expect(cart.snapshot().lines[0]!.packs).toBe(5);
  });

  it('totals pieces and amount from packs', () => {
    cart.add(line, 4);
    expect(cartTotals(cart.snapshot().lines)).toEqual({ packs: 4, pieces: 12, amount: 3000 });
  });

  it('removes a line when quantity drops to zero', () => {
    cart.add(line, 1);
    cart.setPacks('p1', 0);
    expect(cart.snapshot().lines).toHaveLength(0);
  });

  it('keeps the checkout key stable until the cart changes', () => {
    cart.add(line, 1);
    const k = cart.checkoutKey();
    expect(cart.checkoutKey()).toBe(k);
    cart.setPacks('p1', 2);
    expect(cart.checkoutKey()).not.toBe(k);
  });

  it('keeps carts separate per user', () => {
    cart.add(line, 1);
    cart.bindTo('user-b');
    expect(cart.snapshot().lines).toHaveLength(0);
  });
});
