import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

interface Plan { id: string; name: string; key: string; }
interface Row {
  id: string;
  business_id: string;
  business_name: string;
  plan_id: string;
  plan_name: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}
const STATUSES = ['trialing', 'active', 'past_due', 'cancelled'] as const;

export default function AdminSubscriptions() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  const load = async () => {
    setRows(null);
    const [{ data: subs, error }, { data: plansData }, { data: businesses }] = await Promise.all([
      supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('id, name, key').order('display_order'),
      supabase.from('businesses').select('id, name'),
    ]);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    setPlans(plansData ?? []);
    const planMap = new Map((plansData ?? []).map(p => [p.id, p.name]));
    const bizMap = new Map((businesses ?? []).map(b => [b.id, b.name]));

    setRows((subs ?? []).map(s => ({
      id: s.id,
      business_id: s.business_id,
      business_name: bizMap.get(s.business_id) ?? '—',
      plan_id: s.plan_id,
      plan_name: planMap.get(s.plan_id) ?? '—',
      status: s.status,
      trial_ends_at: s.trial_ends_at,
      current_period_end: s.current_period_end,
    })));
  };

  useEffect(() => { load(); }, []);

  const updateField = async (id: string, patch: Record<string, string>) => {
    const { error } = await supabase.from('subscriptions').update(patch as never).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Suscripción actualizada' });
    load();
  };

  const extendTrial = async (id: string, current: string | null) => {
    const base = current ? new Date(current) : new Date();
    base.setDate(base.getDate() + 14);
    await updateField(id, { trial_ends_at: base.toISOString(), status: 'trialing' });
  };

  const statusColor = (s: string) =>
    s === 'active' ? 'default' :
    s === 'trialing' ? 'secondary' :
    s === 'past_due' ? 'destructive' : 'outline';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Suscripciones</h2>
        <p className="text-muted-foreground">Gestiona planes y estado de cada negocio.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Negocio</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fin de prueba</TableHead>
              <TableHead>Fin de periodo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows && Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
            {rows && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay suscripciones.
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.business_name}</TableCell>
                <TableCell>
                  <Select value={r.plan_id} onValueChange={v => updateField(r.id, { plan_id: v })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={v => updateField(r.id, { status: v })}>
                    <SelectTrigger className="w-32">
                      <SelectValue>
                        <Badge variant={statusColor(r.status) as never}>{r.status}</Badge>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => extendTrial(r.id, r.trial_ends_at)}>
                    +14 días prueba
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
