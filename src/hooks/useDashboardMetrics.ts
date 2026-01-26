import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/contexts/BusinessContext';

export interface DashboardMetrics {
  monthlyRevenue: number;
  monthlyRevenueChange: number; // percentage change vs previous month
  activeClients: number;
  activeClientsChange: number; // new clients this month
  pendingInvoices: number;
  pendingAmount: number;
  monthlyPaymentsCount: number;
  monthlyPaymentsChange: number; // percentage change vs previous month
  overdueInvoices: number;
  overdueAmount: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface MetricsRow {
  monthly_revenue: number;
  prev_monthly_revenue: number;
  active_clients: number;
  prev_active_clients: number;
  pending_invoices: number;
  pending_amount: number;
  monthly_payments_count: number;
  prev_monthly_payments_count: number;
  overdue_invoices: number;
  overdue_amount: number;
}

export function useDashboardMetrics(): DashboardMetrics {
  const { activeBusinessId } = useBusiness();
  const [metrics, setMetrics] = useState<Omit<DashboardMetrics, 'isLoading' | 'error' | 'refetch'>>({
    monthlyRevenue: 0,
    monthlyRevenueChange: 0,
    activeClients: 0,
    activeClientsChange: 0,
    pendingInvoices: 0,
    pendingAmount: 0,
    monthlyPaymentsCount: 0,
    monthlyPaymentsChange: 0,
    overdueInvoices: 0,
    overdueAmount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!activeBusinessId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_dashboard_metrics', {
        _business_id: activeBusinessId,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (data && data.length > 0) {
        const row = data[0] as MetricsRow;
        
        // Calculate percentage changes
        const revenueChange = row.prev_monthly_revenue > 0
          ? ((row.monthly_revenue - row.prev_monthly_revenue) / row.prev_monthly_revenue) * 100
          : row.monthly_revenue > 0 ? 100 : 0;
          
        const paymentsChange = row.prev_monthly_payments_count > 0
          ? ((row.monthly_payments_count - row.prev_monthly_payments_count) / row.prev_monthly_payments_count) * 100
          : row.monthly_payments_count > 0 ? 100 : 0;
          
        const clientsChange = row.active_clients - row.prev_active_clients;

        setMetrics({
          monthlyRevenue: Number(row.monthly_revenue) || 0,
          monthlyRevenueChange: Math.round(revenueChange * 10) / 10,
          activeClients: Number(row.active_clients) || 0,
          activeClientsChange: clientsChange,
          pendingInvoices: Number(row.pending_invoices) || 0,
          pendingAmount: Number(row.pending_amount) || 0,
          monthlyPaymentsCount: Number(row.monthly_payments_count) || 0,
          monthlyPaymentsChange: Math.round(paymentsChange * 10) / 10,
          overdueInvoices: Number(row.overdue_invoices) || 0,
          overdueAmount: Number(row.overdue_amount) || 0,
        });
      }
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
      setError(err instanceof Error ? err : new Error('Error al cargar métricas'));
    } finally {
      setIsLoading(false);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    ...metrics,
    isLoading,
    error,
    refetch: fetchMetrics,
  };
}
