import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck, Shield } from 'lucide-react';

interface Row {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  business_count: number;
  is_super_admin: boolean;
}

export default function AdminUsers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const load = async () => {
    setRows(null);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? '');

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    const ids = (profiles ?? []).map(p => p.id);
    const [{ data: members }, { data: platRoles }] = await Promise.all([
      supabase.from('business_members').select('user_id').in('user_id', ids),
      supabase.from('platform_roles').select('user_id').eq('role', 'super_admin').in('user_id', ids),
    ]);

    const counts = new Map<string, number>();
    (members ?? []).forEach(m => counts.set(m.user_id, (counts.get(m.user_id) ?? 0) + 1));
    const supers = new Set((platRoles ?? []).map(p => p.user_id));

    setRows((profiles ?? []).map(p => ({
      ...p,
      business_count: counts.get(p.id) ?? 0,
      is_super_admin: supers.has(p.id),
    })));
  };

  useEffect(() => { load(); }, []);

  const toggleSuperAdmin = async (userId: string, isSuper: boolean, name: string) => {
    if (isSuper) {
      const { error } = await supabase
        .from('platform_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'super_admin');
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Super admin revocado', description: name });
    } else {
      const { error } = await supabase
        .from('platform_roles')
        .insert({ user_id: userId, role: 'super_admin', granted_by: currentUserId });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Super admin asignado', description: name });
    }
    load();
  };

  const filtered = (rows ?? []).filter(r =>
    !search || (r.full_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold">Usuarios</h2>
          <p className="text-muted-foreground">Todos los usuarios registrados en la plataforma.</p>
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
              <TableHead>Usuario</TableHead>
              <TableHead>Negocios</TableHead>
              <TableHead>Rol plataforma</TableHead>
              <TableHead>Registrado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows && Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
            {rows && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No hay usuarios.
                </TableCell>
              </TableRow>
            )}
            {filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={r.avatar_url ?? undefined} />
                      <AvatarFallback>{(r.full_name ?? '?').charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{r.full_name ?? 'Sin nombre'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.id.slice(0, 8)}…</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{r.business_count}</TableCell>
                <TableCell>
                  {r.is_super_admin ? (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20" variant="outline">
                      <ShieldCheck className="w-3 h-3 mr-1" /> Super admin
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Usuario</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(r.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={r.is_super_admin ? 'outline' : 'default'}
                    size="sm"
                    disabled={r.id === currentUserId}
                    onClick={() => toggleSuperAdmin(r.id, r.is_super_admin, r.full_name ?? r.id)}
                    title={r.id === currentUserId ? 'No puedes modificar tu propio rol' : ''}
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    {r.is_super_admin ? 'Revocar' : 'Hacer super admin'}
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
