import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring, useTransform } from 'motion/react';
import clsx from 'clsx';
import { ArrowRight, BellRing, Check, Lock, Minus, PackageCheck, Plus, ShoppingBag, Smartphone } from 'lucide-react';
import { BRAND, Wordmark } from '../../components/Brand';
import { ease } from '../../components/motion';

const TRADES = ['Vests', 'Briefs', 'Trunks', 'Boxers', 'Bras', 'Panties', 'Camisoles', 'Slips', 'Nighties', 'Night suits', 'Pyjamas', 'Lounge shorts', 'Thermals'];

const DYES = [
  { base: '#1e2a4a', thread: '#2f4275' },
  { base: '#b4432e', thread: '#cf6a52' },
  { base: '#e09a2c', thread: '#f0b75a' },
  { base: '#3d7a55', thread: '#5a9a72' },
  { base: '#c4b493', thread: '#d6c9ad' },
  { base: '#4a3b5c', thread: '#6b5885' },
];

function cloth(i: number) {
  const d = DYES[i % DYES.length]!;
  return {
    backgroundColor: d.base,
    backgroundImage: `repeating-linear-gradient(45deg, ${d.thread} 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, rgb(0 0 0 / .14) 0 2px, transparent 2px 8px)`,
  };
}

const rise = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease },
};

// ---------------------------------------------------------------------

function Nav() {
  const { scrollY } = useScroll();
  const border = useTransform(scrollY, [0, 80], ['rgb(221 212 195 / 0)', 'rgb(221 212 195 / 1)']);
  return (
    <motion.header style={{ borderColor: border }} className="sticky top-0 z-40 border-b bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/"><Wordmark /></Link>
        <nav className="hidden items-center gap-8 text-[14px] font-semibold text-ink-soft md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#packs" className="hover:text-ink">Packs</a>
          <a href="#why" className="hover:text-ink">Why order here</a>
        </nav>
        <div className="flex items-center gap-1.5">
          <Link to="/sign-in" className="rounded-full px-4 py-2 text-[14px] font-semibold text-ink-soft hover:text-ink">Sign in</Link>
          <Link to="/register" className="hidden rounded-full bg-indigo px-5 py-2.5 text-[14px] font-semibold text-paper transition hover:bg-indigo-700 sm:inline-flex">Register shop</Link>
        </div>
      </div>
    </motion.header>
  );
}

/** Marigold hand-drawn underline that draws itself under a word. */
function Underlined({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <em className="relative z-10 text-indigo">{children}</em>
      <svg viewBox="0 0 300 24" preserveAspectRatio="none" className="absolute -bottom-1 left-0 z-0 h-[0.38em] w-full" aria-hidden>
        <motion.path
          d="M4 16 C 60 4, 120 22, 180 10 S 270 8, 296 14"
          fill="none"
          stroke="var(--color-marigold)"
          strokeWidth="9"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.7, ease }}
        />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------

function HeroArt() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const ticketY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -90]), { stiffness: 120, damping: 24 });
  const stackY = useTransform(scrollYProgress, [0, 1], [0, 50]);

  const folds = [0, 1, 2, 3, 4, 5];

  return (
    <div ref={ref} className="relative mx-auto aspect-[5/5] w-full max-w-[480px]">
      {/* soft backdrop disc */}
      <motion.div
        className="absolute inset-[8%] rounded-full bg-paper-2"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease }}
      />
      <motion.svg viewBox="0 0 200 200" className="absolute inset-0 size-full text-line-strong" initial={{ rotate: -20, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 1.4, ease }}>
        <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 4" />
      </motion.svg>

      {/* folded cloth stack */}
      <motion.div style={{ y: stackY }} className="absolute inset-x-[16%] bottom-[16%] flex flex-col-reverse items-center">
        {folds.map((i) => (
          <motion.div
            key={i}
            className="relative -mt-1.5 h-[13%] rounded-[10px] shadow-[0_6px_14px_-6px_rgb(26_31_43/.45)]"
            style={{ ...cloth(i), width: `${100 - (i % 2) * 4 - i * 1.5}%`, aspectRatio: '6 / 1', zIndex: 10 - i }}
            initial={{ y: -260, opacity: 0, rotate: i % 2 ? 6 : -6 }}
            animate={{ y: 0, opacity: 1, rotate: i % 2 ? 1.2 : -1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 17, delay: 0.25 + (folds.length - i) * 0.09 }}
          >
            <span className="absolute inset-y-0 right-[14%] w-px bg-black/15" />
            <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-[10px] bg-white/20" />
          </motion.div>
        ))}
      </motion.div>

      {/* floating order ticket */}
      <motion.div
        style={{ y: ticketY }}
        className="absolute top-[4%] -right-1 z-20 w-[56%] min-w-[200px] sm:right-[-6%]"
        initial={{ opacity: 0, x: 40, rotate: 8 }}
        animate={{ opacity: 1, x: 0, rotate: 3 }}
        transition={{ duration: 0.9, delay: 1.0, ease }}
      >
        <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between">
            <span className="label-caps">Sample order</span>
            <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-[10px] font-bold text-leaf">Pack of 5</span>
          </div>
          <p className="mt-2 font-display text-lg leading-tight font-medium">Cotton rib vest</p>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {[['80', 2], ['85', 3], ['90', 2], ['95', 1]].map(([s, q], i) => (
              <motion.div key={s as string} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 + i * 0.08 }}
                className="rounded-lg bg-paper-2 py-1.5 text-center">
                <p className="text-[10px] font-bold text-ink-mute">{s}</p>
                <p className="tabular text-sm font-bold">×{q}</p>
              </motion.div>
            ))}
          </div>
          <div className="stitch my-3" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-mute">8 packs · 40 pcs</span>
            <span className="inline-flex items-center gap-1 font-semibold text-indigo"><Plus className="size-3.5" />Add to cart</span>
          </div>
        </motion.div>
      </motion.div>

      {/* status chip */}
      <motion.div
        className="absolute bottom-[6%] -left-1 z-20 sm:left-[-8%]"
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 1.6, ease }}
      >
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="flex items-center gap-3 rounded-2xl bg-indigo py-3 pr-5 pl-3 text-paper shadow-[var(--shadow-pop)]">
          <span className="grid size-9 place-items-center rounded-xl bg-leaf"><PackageCheck className="size-5" /></span>
          <span>
            <span className="block text-[11px] font-semibold tracking-wider text-paper/60 uppercase">Order update</span>
            <span className="block text-sm font-semibold">Packed &amp; dispatched</span>
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Hero() {
  const words = ['Innerwear', '&', 'nightwear,'];
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 md:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-6 lg:pb-28">
        <div>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-soft">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-leaf opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-leaf" /></span>
            Now taking orders online
          </motion.p>
          <h1 className="text-[clamp(2.4rem,11vw,2.9rem)] leading-[0.98] font-medium sm:text-[64px] lg:text-[66px] xl:text-[72px]">
            {words.map((w, i) => (
              <motion.span key={w} className="mr-[0.22em] inline-block" initial={{ opacity: 0, y: 40, rotate: 3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.8, delay: 0.1 + i * 0.1, ease }}>
                {w}
              </motion.span>
            ))}
            <br />
            <motion.span className="inline-block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease }}>
              ordered <Underlined>by the pack.</Underlined>
            </motion.span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5, ease }}
            className="mt-7 max-w-lg text-[17px] leading-relaxed text-ink-soft">
            {BRAND.name} brings its ladies’ and gents’ innerwear and nightwear range to your phone. See new
            lots the day they land, order by the pack in every size, and follow each order until it reaches your counter.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.62, ease }}
            className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/register" className="group inline-flex h-14 items-center gap-2 rounded-full bg-indigo pr-6 pl-7 text-[16px] font-semibold text-paper shadow-[inset_0_-2px_0_rgb(0_0_0/.25)] transition hover:bg-indigo-700">
              Open a trade account
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </Link>
            <Link to="/sign-in" className="inline-flex h-14 items-center rounded-full border border-line-strong bg-card px-7 text-[16px] font-semibold text-ink transition hover:border-indigo hover:text-indigo">
              I already have one
            </Link>
          </motion.div>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] font-medium text-ink-mute">
            {['Free to register', 'Works on any phone', 'For retailers only'].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-leaf" strokeWidth={2.5} />{t}</li>
            ))}
          </motion.ul>
        </div>
        <HeroArt />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------

function TradeRibbon() {
  return (
    <section className="weave grain relative overflow-hidden py-6 text-paper">
      <motion.div className="flex w-max gap-10 whitespace-nowrap" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}>
        {[...TRADES, ...TRADES].map((t, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-[28px] italic sm:text-[34px]">
            {t}
            <svg viewBox="0 0 20 20" className="size-4 text-marigold" aria-hidden><path d="M10 0l2.6 7.4L20 10l-7.4 2.6L10 20l-2.6-7.4L0 10l7.4-2.6z" fill="currentColor" /></svg>
          </span>
        ))}
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------

const STEPS = [
  { title: 'Register your shop', body: 'Create an account with your email, add your shop name, GSTIN and city once, and you are in.', icon: <Smartphone className="size-5" /> },
  { title: 'Order by the pack', body: 'Open a brand, pick a section like vests, briefs or night suits, and choose how many packs of each size you need.', icon: <ShoppingBag className="size-5" /> },
  { title: 'Track it to your counter', body: 'The office confirms prices, packs your order and you get an alert the moment it is dispatched.', icon: <BellRing className="size-5" /> },
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 60%'] });
  const line = useSpring(scrollYProgress, { stiffness: 80, damping: 20 });

  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 lg:py-32">
      <motion.div {...rise} className="max-w-2xl">
        <p className="label-caps mb-3">How it works</p>
        <h2 className="text-[38px] leading-[1.04] font-medium sm:text-[52px]">From our godown to your shelf in <em className="text-indigo">three steps.</em></h2>
      </motion.div>

      <div ref={ref} className="relative mt-16">
        <div className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-line md:block">
          <motion.div style={{ scaleX: line }} className="h-full origin-left bg-marigold" />
        </div>
        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <motion.li key={s.title} {...rise} transition={{ ...rise.transition, delay: i * 0.12 }} className="relative md:text-center">
              <div className="relative z-10 mb-6 flex items-center gap-4 md:flex-col">
                <span className="grid size-14 place-items-center rounded-2xl border border-line bg-card text-indigo shadow-[var(--shadow-lift)]">{s.icon}</span>
                <span className="font-display text-sm text-ink-mute italic md:hidden">Step {i + 1}</span>
              </div>
              <p className="hidden font-display text-sm text-ink-mute italic md:block">Step {i + 1}</p>
              <h3 className="mt-1 text-2xl font-medium">{s.title}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-ink-soft md:mx-auto md:max-w-xs">{s.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------

const PACK_SIZES = ['80', '85', '90', '95', '100'];
const PACK_OF = 5;

function PackBuilder() {
  const [packs, setPacks] = useState<Record<string, number>>({ '80': 1, '85': 3, '90': 3, '95': 2, '100': 0 });
  const total = Object.values(packs).reduce((a, b) => a + b, 0);
  const bump = (s: string, d: number) => setPacks((q) => ({ ...q, [s]: Math.max(0, Math.min(8, (q[s] ?? 0) + d)) }));

  return (
    <section id="packs" className="scroll-mt-20 bg-paper-2/60">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:py-32">
        <motion.div {...rise}>
          <p className="label-caps mb-3">The pack system</p>
          <h2 className="text-[34px] leading-[1.04] font-medium sm:text-[52px]">Every size, <em className="text-indigo">one order.</em></h2>
          <p className="mt-6 max-w-md text-[16.5px] leading-relaxed text-ink-soft">
            Innerwear and nightwear come in sealed packs, for example a box of {PACK_OF} vests in one size.
            Set how many packs of each size you want and add them all at once. Try it here.
          </p>
          <div className="mt-8 flex flex-wrap gap-6 text-sm">
            <div><p className="font-display text-3xl font-medium">Fewer</p><p className="text-ink-mute">mistakes on size counts</p></div>
            <div className="w-px bg-line-strong" />
            <div><p className="font-display text-3xl font-medium">Faster</p><p className="text-ink-mute">re-orders of bestsellers</p></div>
          </div>
        </motion.div>

        <motion.div {...rise} transition={{ ...rise.transition, delay: 0.1 }} className="rounded-[28px] border border-line bg-card p-4 shadow-[var(--shadow-pop)] sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="label-caps">Men’s innerwear</p>
              <p className="mt-1 font-display text-2xl font-medium">Cotton rib vest</p>
            </div>
            <span className="shrink-0 rounded-full bg-leaf-100 px-2.5 py-1 text-[11px] font-bold text-leaf">Pack of {PACK_OF}</span>
          </div>

          <div className="mt-6 grid grid-cols-5 gap-1.5 sm:gap-2">
            {PACK_SIZES.map((s, i) => {
              const n = packs[s] ?? 0;
              return (
                <div key={s} className="flex min-w-0 flex-col items-center gap-2">
                  <span className="text-xs font-bold text-ink-mute">{s}</span>
                  <div className="relative flex h-28 w-full flex-col-reverse items-center gap-1 overflow-hidden rounded-xl bg-paper-2 p-1.5">
                    <AnimatePresence initial={false}>
                      {Array.from({ length: n }).map((_, k) => (
                        <motion.span key={k} layout initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0, transition: { duration: 0.15 } }}
                          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                          className="h-[9px] w-full shrink-0 rounded-[4px]" style={cloth(i)} />
                      ))}
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center">
                    <button aria-label={`Fewer packs of ${s}`} onClick={() => bump(s, -1)} className="grid size-6 place-items-center rounded-full text-ink-mute hover:bg-paper-2 hover:text-ink sm:size-7"><Minus className="size-3.5" /></button>
                    <span className="tabular w-4 text-center text-sm font-bold">{n}</span>
                    <button aria-label={`More packs of ${s}`} onClick={() => bump(s, 1)} className="grid size-6 place-items-center rounded-full text-ink-mute hover:bg-paper-2 hover:text-ink sm:size-7"><Plus className="size-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="stitch my-6" />

          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="text-sm font-semibold text-ink-soft"><span className="tabular">{total}</span> packs <span className="text-ink-mute">× {PACK_OF} pcs</span></p>
            <p className="font-display text-3xl font-medium">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={total} className="tabular inline-block" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}>
                  {total * PACK_OF}
                </motion.span>
              </AnimatePresence>{' '}
              <span className="text-lg text-ink-mute">pieces</span>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------

function Why() {
  const items = [
    {
      title: 'Live order tracking',
      body: 'See each order go from placed to completed, with an alert the moment it moves.',
      art: (
        <div className="space-y-2">
          {['Placed', 'Packed', 'Dispatched'].map((s, i) => (
            <motion.div key={s} initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.25 }}
              className="flex items-center gap-2.5 text-sm font-semibold">
              <span className={clsx('grid size-5 place-items-center rounded-full text-white', i < 2 ? 'bg-leaf' : 'bg-marigold')}><Check className="size-3" strokeWidth={3} /></span>{s}
            </motion.div>
          ))}
        </div>
      ),
      className: 'md:col-span-2',
    },
    {
      title: 'Your cart waits for you',
      body: 'Build an order through the day; it’s still there when you come back.',
      art: <ShoppingBag className="size-9 text-indigo" />,
    },
    {
      title: 'Just packs and sizes',
      body: 'Pick a design, choose how many packs of each size, and the office takes it from there.',
      art: <PackageCheck className="size-9 text-indigo" />,
    },
    {
      title: 'Trade only, verified',
      body: 'Every account is a verified business email. Your orders and details stay private to you and the office.',
      art: <Lock className="size-9 text-indigo" />,
      className: 'md:col-span-2',
      dark: true,
    },
  ];

  return (
    <section id="why" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 lg:py-32">
      <motion.div {...rise} className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="label-caps mb-3">Why order here</p>
          <h2 className="text-[38px] leading-[1.04] font-medium sm:text-[52px]">Built for the <em className="text-indigo">counter,</em> not the boardroom.</h2>
        </div>
        <p className="max-w-sm text-[15.5px] leading-relaxed text-ink-soft">No catalogues on WhatsApp, no lost voice notes, no guessing what was ordered last time.</p>
      </motion.div>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {items.map((it, i) => (
          <motion.div key={it.title} {...rise} transition={{ ...rise.transition, delay: (i % 3) * 0.08 }} whileHover={{ y: -4 }}
            className={clsx('relative flex min-h-[230px] flex-col justify-between overflow-hidden rounded-[24px] border p-7',
              it.dark ? 'weave grain border-indigo text-paper' : 'border-line bg-card', it.className)}>
            <div className={clsx('relative', it.dark && '[&_svg]:text-marigold')}>{it.art}</div>
            <div className="relative mt-8">
              <h3 className="text-2xl font-medium">{it.title}</h3>
              <p className={clsx('mt-2 max-w-md text-[15px] leading-relaxed', it.dark ? 'text-paper/70' : 'text-ink-soft')}>{it.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------

function FinalCta() {
  return (
    <section className="px-4 pb-16 sm:px-6">
      <motion.div {...rise} className="weave grain relative mx-auto max-w-6xl overflow-hidden rounded-[32px] px-6 py-16 text-center text-paper sm:px-12 sm:py-24">
        <motion.div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-marigold/25 blur-3xl" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.div className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-madder/25 blur-3xl" animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 9, repeat: Infinity }} />
        <h2 className="relative mx-auto max-w-3xl text-[40px] leading-[1.02] font-medium sm:text-[60px]">
          Ready to stock up <em className="text-marigold">smarter?</em>
        </h2>
        <p className="relative mx-auto mt-5 max-w-lg text-[16.5px] leading-relaxed text-paper/70">
          Register in two minutes. Your first order can go out today.
        </p>
        <div className="relative mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="group inline-flex h-14 items-center gap-2 rounded-full bg-marigold pr-6 pl-7 text-[16px] font-semibold text-indigo transition hover:brightness-105">
            Register your shop <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Link>
          <Link to="/sign-in" className="inline-flex h-14 items-center rounded-full border border-paper/25 px-7 text-[16px] font-semibold text-paper transition hover:bg-paper/10">
            Sign in
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-ink-mute">{BRAND.tagline}</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-semibold text-ink-soft">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#packs" className="hover:text-ink">Packs</a>
          <Link to="/register" className="hover:text-ink">Register</Link>
          <Link to="/sign-in" className="hover:text-ink">Sign in</Link>
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <Link to="/terms" className="hover:text-ink">Terms</Link>
        </div>
        <p className="text-xs text-ink-mute">© {new Date().getFullYear()} {BRAND.name}</p>
      </div>
    </footer>
  );
}

export function Landing() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <div className="min-h-dvh overflow-x-clip">
      <motion.div style={{ scaleX: progress }} className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-marigold" />
      <Nav />
      <main>
        <Hero />
        <TradeRibbon />
        <HowItWorks />
        <PackBuilder />
        <Why />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
