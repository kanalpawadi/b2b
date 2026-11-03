import { useState, type FormEvent } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, friendlyError } from '../../lib/supabase';
import { dateOnly, displayPhone } from '../../lib/format';
import { Avatar, Button, Card, Confirm, Field, Input, PageHeader, Select } from '../../components/ui';
import { Page } from '../../components/motion';
import { useAuth, useMe } from '../auth/AuthProvider';
import { STATES } from '../auth/states';

export function Account() {
  const me = useMe();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: me.full_name, shop_name: me.shop_name ?? '', gst_number: me.gst_number ?? '',
    area: me.area ?? '', city: me.city ?? '', state: me.state ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const gst = form.gst_number.trim().toUpperCase();
    if (gst && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gst)) return toast.error('A GSTIN is 15 characters, e.g. 27ABCDE1234F1Z5');
    if (form.full_name.trim().length < 2) return toast.error('Enter your full name');
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name.trim(),
      shop_name: form.shop_name.trim() || null,
      gst_number: gst || null,
      area: form.area.trim() || null,
      city: form.city.trim() || null,
      state: form.state || null,
    }).eq('id', me.id);
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries({ queryKey: ['me'] });
    toast.success('Details saved');
  };

  const remove = async () => {
    setDeleting(true);
    const { error } = await supabase.rpc('delete_my_account');
    setDeleting(false);
    if (error) return toast.error(friendlyError(error));
    await signOut();
    toast.success('Your account has been deleted.');
  };

  return (
    <Page>
      <PageHeader eyebrow="Account" title={<>Your <em className="text-indigo">shop</em></>} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-6">
          <Avatar name={me.full_name} className="size-16 text-xl" />
          <p className="mt-4 font-display text-2xl font-medium">{me.shop_name ?? me.full_name}</p>
          <p className="text-sm text-ink-soft">{me.full_name}</p>
          <div className="stitch my-5" />
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-ink-mute">Email</dt><dd className="truncate font-semibold">{me.email ?? '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-mute">Mobile</dt><dd className="font-semibold">{displayPhone(me.phone)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-mute">Member since</dt><dd className="font-semibold">{dateOnly(me.created_at)}</dd></div>
          </dl>
          <Button variant="outline" className="mt-6 w-full" icon={<LogOut className="size-4" />} onClick={signOut}>Sign out</Button>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-5 text-2xl font-medium">Shop details</h2>
            <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
              <Field label="Your name" htmlFor="n"><Input id="n" value={form.full_name} onChange={set('full_name')} /></Field>
              {me.role === 'retailer' && (
                <>
                  <Field label="Shop name" htmlFor="s"><Input id="s" value={form.shop_name} onChange={set('shop_name')} /></Field>
                  <Field label="GSTIN" htmlFor="g"><Input id="g" className="uppercase" maxLength={15} value={form.gst_number} onChange={set('gst_number')} /></Field>
                  <Field label="Area / market" htmlFor="a"><Input id="a" value={form.area} onChange={set('area')} /></Field>
                  <Field label="City" htmlFor="c"><Input id="c" value={form.city} onChange={set('city')} /></Field>
                  <Field label="State" htmlFor="st">
                    <Select id="st" value={form.state} onChange={set('state')}>
                      <option value="">Choose…</option>
                      {STATES.map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </Field>
                </>
              )}
              <div className="sm:col-span-2"><Button type="submit" loading={saving}>Save changes</Button></div>
            </form>
          </Card>

          {!me.is_owner && (
            <Card className="border-madder/30 p-6">
              <h2 className="text-xl font-medium">Delete account</h2>
              <p className="mt-1 text-sm text-ink-soft">Removes your login and personal details. Past orders stay in the shop’s records under your shop name.</p>
              <Button variant="outline" className="mt-4 hover:!border-madder hover:!text-madder" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete my account</Button>
            </Card>
          )}
        </div>
      </div>
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} loading={deleting} title="Delete your account?" confirmLabel="Delete forever"
        body="You will be signed out. Registering with this email again will start a brand-new account." />
    </Page>
  );
}
