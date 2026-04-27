import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, CreditCard, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Stats {
  businesses: number;
  users: number;
  activeSubs: number;
  trialingSubs: number;
  invoices: number;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [b, p, sActive, sTrial, inv] = await Promise.all([
        supabase.from('businesses').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'trialing'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }),
      ]);
      setStats({
        businesses: b.count ?? 0,
        users: p.count ?? 0,
        activeSubs: sActive.count ?? 0,
        trialingSubs: sTrial.count ?? 0,
        invoices: inv.count ?? 0,
      });
    })();
  }, []);

  const items = [
    { label: 'Negocios', value: stats?.businesses, icon: Building2 },
    { label: 'Usuarios', value: stats?.users, icon: Users },
    { label: 'Suscripciones activas', value: stats?.activeSubs, icon: CreditCard },
    { label: 'En periodo de prueba', value: stats?.trialingSubs, icon: CreditCard },
    { label: 'Facturas totales', value: stats?.invoices, icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Resumen de plataforma</h2>
        <p className="text-muted-foreground">Métricas globales en tiempo real.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="text-3xl font-semibold">{item.value}</div>
                ) : (
                  <Skeleton className="h-9 w-20" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
