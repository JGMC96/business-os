import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Row {
  id: string;
  name: string;
  industry: string | null;
  currency: string;
  created_at: string;
  member_count: number;
  plan_name: string | null;
  sub_status: string | null;
}

export default function AdminBusinesses() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setRows(null);
    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, name, industry, currency, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    const ids = (businesses ?? []).map(b => b.id);
    const [{ data: members }, { data: subs }, { data: plans }] = await Promise.all([
      supabase.from('business_members').select('business_id').in('business_id', ids),
      supabase.from('subscriptions').select('business_id, plan_id, status').in('business_id', ids),
      supabase.from('plans').select('id, name'),
    ]);

    const counts = new Map<string, number>();
    (members ?? []).forEach(m => counts.set(m.business_id, (counts.get(m.business_id) ?? 0) + 1));
    const planMap = new Map((plans ?? []).map(p => [p.id, p.name]));
    const subMap = new Map((subs ?? []).map(s => [s.business_id, s]));

    setRows((businesses ?? []).map(b => {
      const sub = subMap.get(b.id);
      return {
        ...b,
        member_count: counts.get(b.id) ?? 0,
        plan_name: sub ? planMap.get(sub.plan_id) ?? null : null,
        sub_status: sub?.status ?? null,
      };
    }));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string, name: string) => {
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Negocio eliminado', description: name });
    load();
  };

  const filtered = (rows ?? []).filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold">Negocios</h2>
          <p className="text-muted-foreground">Todos los negocios de la plataforma.</p>
        </div>
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Industria</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Miembros</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows && Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
            {rows && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No hay negocios.
                </TableCell>
              </TableRow>
            )}
            {filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.industry ?? '—'}</TableCell>
                <TableCell>{r.currency}</TableCell>
                <TableCell>{r.member_count}</TableCell>
                <TableCell>{r.plan_name ?? '—'}</TableCell>
                <TableCell>
                  {r.sub_status ? (
                    <Badge variant={r.sub_status === 'active' ? 'default' : 'secondary'}>
                      {r.sub_status}
                    </Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(r.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar negocio?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Vas a eliminar <strong>{r.name}</strong> y todos sus datos asociados.
                          Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(r.id, r.name)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
