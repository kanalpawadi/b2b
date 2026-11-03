import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError, supabase } from '../../lib/supabase';
import { cart } from '../../lib/cart';
import type { Profile } from '../../lib/types';

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  /** True until we know whether someone is signed in (and who). */
  loading: boolean;
  refreshProfile: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const uid = session?.user.id;

  useEffect(() => {
    // Google sends failures back as ?error_description=… (or in the hash).
    const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, '&'));
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) {
      toast.error(friendlyError({ message: oauthError }));
      window.history.replaceState(null, '', window.location.pathname);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    cart.bindTo(uid ?? null);
    if (!uid) qc.clear();
  }, [uid, qc]);

  const profileQuery = useQuery({
    queryKey: ['me', uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
    refetchOnWindowFocus: true,
  });

  // Live updates: a new notification or an order changing state refreshes
  // the relevant lists without the user reloading.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`live-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['me'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        qc.invalidateQueries({ queryKey: ['announcements'] });
        qc.invalidateQueries({ queryKey: ['companies'] });
        qc.invalidateQueries({ queryKey: ['company-trades'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['order'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, qc]);

  const value: AuthValue = {
    session,
    profile: profileQuery.data ?? null,
    loading: !sessionReady || (Boolean(uid) && profileQuery.isPending),
    refreshProfile: () => profileQuery.refetch(),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Profile that is guaranteed present (use only under the signed-in routes). */
export function useMe(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('useMe without a profile');
  return profile;
}
