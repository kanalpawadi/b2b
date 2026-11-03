import { animate } from 'motion';

/** Sends a little marigold "pack" from the clicked button to the cart badge. */
export function flyToCart(from: HTMLElement | null) {
  const target = document.getElementById('cart-count');
  if (!from || !target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const dot = document.createElement('div');
  Object.assign(dot.style, {
    position: 'fixed', left: `${a.left + a.width / 2 - 12}px`, top: `${a.top + a.height / 2 - 12}px`,
    width: '24px', height: '24px', borderRadius: '7px', background: 'var(--color-marigold)',
    boxShadow: '0 8px 20px -6px rgb(30 42 74 / .5)', zIndex: '100', pointerEvents: 'none',
  });
  document.body.appendChild(dot);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  animate(
    dot,
    { x: [0, dx * 0.4, dx], y: [0, dy - 120, dy], scale: [1, 1.15, 0.4], rotate: [0, 90, 200], opacity: [1, 1, 0.6] },
    { duration: 0.75, ease: [0.5, 0, 0.3, 1] },
  ).then(() => {
    dot.remove();
    animate(target, { scale: [1, 1.35, 1] }, { duration: 0.35 });
  });
}
