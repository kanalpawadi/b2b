import { motion } from 'motion/react';
import { Ban, Clock, Database, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';
import { Wordmark } from '../../components/Brand';
import { ease } from '../../components/motion';
import { useAuth } from './AuthProvider';

function Gate({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-8">
      <Wordmark />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="my-auto max-w-md text-center">
        <motion.div
          className="mx-auto mb-6 grid size-20 place-items-center rounded-[24px] bg-card text-indigo shadow-[var(--shadow-lift)]"
          animate={{ rotate: [0, -4, 4, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {icon}
        </motion.div>
        <h1 className="text-[34px] leading-tight font-medium">{title}</h1>
        <div className="mt-3 text-[15px] leading-relaxed text-ink-soft">{body}</div>
        {children && <div className="mt-8 flex justify-center gap-2">{children}</div>}
      </motion.div>
    </div>
  );
}

export function AwaitingApproval() {
  const { signOut, refreshProfile } = useAuth();
  return (
    <Gate icon={<Clock className="size-9" />} title="Waiting for the owner" body="Your request is in. The owner has been notified and will approve your admin access shortly.">
      <Button variant="outline" icon={<RefreshCw className="size-4" />} onClick={() => refreshProfile()}>Check again</Button>
      <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={signOut}>Sign out</Button>
    </Gate>
  );
}

export function Blocked() {
  const { signOut } = useAuth();
  return (
    <Gate icon={<Ban className="size-9" />} title="Account paused" body="This account has been paused by Mukesh Sales. Please call the office if you think this is a mistake.">
      <Button variant="outline" icon={<LogOut className="size-4" />} onClick={signOut}>Sign out</Button>
    </Gate>
  );
}

export function ProfileMissing() {
  const { signOut } = useAuth();
  return (
    <Gate icon={<RefreshCw className="size-9" />} title="Finishing sign-up" body="We couldn’t load your account yet. If you signed up a moment ago, give it a few seconds and try again.">
      <Button variant="outline" onClick={() => location.reload()}>Try again</Button>
      <Button variant="ghost" onClick={signOut}>Sign out</Button>
    </Gate>
  );
}

export function SetupNeeded() {
  return (
    <Gate
      icon={<Database className="size-9" />}
      title="Connect Supabase"
      body={
        <>
          Copy <code className="rounded bg-paper-2 px-1.5 py-0.5 text-[13px]">web/.env.example</code> to{' '}
          <code className="rounded bg-paper-2 px-1.5 py-0.5 text-[13px]">web/.env.local</code>, fill in your project URL and
          publishable key, then restart <code className="rounded bg-paper-2 px-1.5 py-0.5 text-[13px]">npm run dev</code>.
        </>
      }
    />
  );
}
