import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui';
import { ease, Page } from '../../components/motion';
import { BRAND, MSC_LOGO } from '../../components/Brand';

// The copy below is the client's own text; keep it word for word.
export function About() {
  return (
    <Page className="mx-auto max-w-3xl">
      <section className="mb-10 flex flex-col items-center text-center">
        <motion.img src={MSC_LOGO} alt={`${BRAND.name} logo`} className="h-32 w-auto sm:h-40"
          initial={{ opacity: 0, scale: 0.85, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} />
        <p className="label-caps mt-6">About us · Since 2000</p>
        <h1 className="mt-2 text-[34px] leading-[1.05] font-medium sm:text-[48px]">About Mukesh Sales Corporation</h1>
      </section>

      <motion.div className="space-y-5 text-[16.5px] leading-[1.75] text-ink-soft"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15, ease }}>
        <p className="first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-[56px] first-letter:leading-[0.9] first-letter:font-medium first-letter:text-indigo">
          Established in the year 2000, Mukesh Sales Corporation has grown to become a trusted wholesale distributor of premium garments, partnering with leading apparel manufacturers to serve retailers across the region. With over two decades of industry expertise, we bridge the gap between top-tier fashion brands and retail stores, ensuring a seamless supply of quality apparel, latest trends, and reliable inventory.
        </p>
        <p>
          Our core philosophy is built on strong partnerships, transparent business practices, and an unwavering commitment to customer satisfaction. We take pride in empowering retailers with competitive pricing, diverse product collections, and timely deliveries, helping their businesses thrive in a dynamic market.
        </p>
        <p className="font-medium text-ink">
          At Mukesh Sales Corporation, we don’t just supply garments—we build lasting relationships grounded in trust and mutual growth.
        </p>
      </motion.div>

      <motion.figure className="weave grain relative mt-12 overflow-hidden rounded-[26px] p-7 text-paper sm:p-10"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.45, ease }}>
        <span aria-hidden className="absolute -top-6 left-4 font-display text-[140px] leading-none text-marigold/30">“</span>
        <p className="relative text-[11px] font-semibold tracking-[0.16em] text-marigold uppercase">For our retailers</p>
        <blockquote className="relative mt-3 font-display text-[22px] leading-snug font-medium italic sm:text-[28px]">
          "Great retail success begins at the source. At Mukesh Sales Corporation, we empower your shelves with the quality your customers demand and the wholesale reliability your business deserves."
        </blockquote>
        <figcaption className="relative mt-5 text-sm text-paper/70">— {BRAND.name}</figcaption>
      </motion.figure>

      <div className="mt-10 flex justify-center">
        <Link to="/"><Button>Browse companies <ArrowRight className="size-4" /></Button></Link>
      </div>
    </Page>
  );
}
