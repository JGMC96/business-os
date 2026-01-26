import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/contexts/BusinessContext';
import { useToast } from '@/hooks/use-toast';
import type { 
  Payment, 
  PaymentWithInvoice, 
  InvoiceForPayment, 
  CreatePaymentData,
  InvoiceStatus 
} from '@/types/database';

interface UsePaymentsReturn {
  payments: PaymentWithInvoice[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  fetchPayments: () => Promise<void>;
  createPayment: (data: CreatePaymentData) => Promise<boolean>;
  fetchPayableInvoices: () => Promise<InvoiceForPayment[]>;
}

// Sanitize search term to prevent .or() parsing issues
function sanitizeSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function usePayments(): UsePaymentsReturn {
  const { activeBusinessId, user } = useBusiness();
  const { toast } = useToast();
  
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Request ID counter for race condition protection
  const requestIdRef = useRef(0);

  // Single unified fetch function with race condition protection
  const runFetch = useCallback(async (requestId: number) => {
    if (!activeBusinessId) {
      if (requestId === requestIdRef.current) {
        setPayments([]);
        setIsLoading(false);
      }
      return;
    }

    try {
      let query = supabase
        .from('payments')
        .select(`
          *,
          invoices (
            invoice_number,
            total
          )
        `)
        .eq('business_id', activeBusinessId)
        .order('payment_date', { ascending: false });

      // Search filter by invoice number
      const sanitizedTerm = sanitizeSearchTerm(searchTerm);
      if (sanitizedTerm) {
        // For searching by invoice number, we need to filter after fetching
        // since PostgREST doesn't support filtering on joined columns easily
      }

      const { data, error: fetchError } = await query;

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (fetchError) {
        throw fetchError;
      }

      // Transform data to include invoice info and filter by search
      let transformedPayments: PaymentWithInvoice[] = (data || []).map((payment) => ({
        ...payment,
        invoice_number: payment.invoices?.invoice_number || undefined,
        invoice_total: payment.invoices?.total ? Number(payment.invoices.total) : undefined,
      }));

      // Filter by search term (invoice number or payment method)
      if (sanitizedTerm) {
        const lowerTerm = sanitizedTerm.toLowerCase();
        transformedPayments = transformedPayments.filter((p) =>
          p.invoice_number?.toLowerCase().includes(lowerTerm) ||
          p.payment_method?.toLowerCase().includes(lowerTerm)
        );
      }

      setPayments(transformedPayments);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      
      console.error('Error fetching payments:', err);
      setError(err instanceof Error ? err : new Error('Error al cargar pagos'));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeBusinessId, searchTerm]);

  // Public fetch function that increments request ID
  const fetchPayments = useCallback(async () => {
    const newRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    await runFetch(newRequestId);
  }, [runFetch]);

  // Effect for initial load and dependency changes
  useEffect(() => {
    const newRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    runFetch(newRequestId);
  }, [runFetch]);

  // Recalculate invoice status after payment
  const recalculateInvoiceStatus = useCallback(async (invoiceId: string) => {
    if (!activeBusinessId) return;

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, total, status, due_date')
      .eq('id', invoiceId)
      .eq('business_id', activeBusinessId)
      .single();

    if (invoiceError || !invoice) {
      console.error('Error fetching invoice for recalc:', invoiceError);
      return;
    }

    // Don't touch draft or cancelled invoices
    if (invoice.status === 'draft' || invoice.status === 'cancelled') {
      return;
    }

    // Sum all payments for this invoice
    const { data: invoicePayments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId)
      .eq('business_id', activeBusinessId);

    if (paymentsError) {
      console.error('Error fetching payments for recalc:', paymentsError);
      return;
    }

    const totalPaid = (invoicePayments || []).reduce(
      (sum, p) => sum + Number(p.amount), 
      0
    );

    // Determine new status
    let newStatus: InvoiceStatus;
    const updateData: Record<string, unknown> = {};

    if (totalPaid >= Number(invoice.total)) {
      newStatus = 'paid';
      updateData.paid_at = new Date().toISOString();
    } else if (invoice.due_date && new Date(invoice.due_date) < new Date()) {
      newStatus = 'overdue';
    } else {
      newStatus = 'sent';
    }

    updateData.status = newStatus;

    const { error: updateError } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId)
      .eq('business_id', activeBusinessId);

    if (updateError) {
      console.error('Error updating invoice status:', updateError);
    }
  }, [activeBusinessId]);

  // Create payment
  const createPayment = useCallback(async (data: CreatePaymentData): Promise<boolean> => {
    if (!activeBusinessId || !user) {
      toast({
        title: 'Error',
        description: 'No hay negocio activo',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          business_id: activeBusinessId,
          invoice_id: data.invoice_id,
          amount: data.amount,
          payment_method: data.payment_method || null,
          payment_date: data.payment_date,
          notes: data.notes || null,
          created_by: user.id,
        });

      if (paymentError) {
        throw paymentError;
      }

      // Recalculate invoice status
      await recalculateInvoiceStatus(data.invoice_id);

      toast({
        title: 'Pago registrado',
        description: 'El pago se ha registrado correctamente',
      });

      await fetchPayments();
      return true;
    } catch (err) {
      console.error('Error creating payment:', err);
      toast({
        title: 'Error al registrar pago',
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeBusinessId, user, recalculateInvoiceStatus, fetchPayments, toast]);

  // Fetch invoices available for payment (sent, overdue, or paid for additional payments)
  const fetchPayableInvoices = useCallback(async (): Promise<InvoiceForPayment[]> => {
    if (!activeBusinessId) {
      return [];
    }

    try {
      // Get invoices that can receive payments (not draft or cancelled)
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          total,
          status,
          due_date,
          clients (
            name
          )
        `)
        .eq('business_id', activeBusinessId)
        .in('status', ['sent', 'overdue', 'paid'])
        .order('created_at', { ascending: false });

      if (invoicesError) {
        throw invoicesError;
      }

      // Get all payments to calculate totals
      const { data: allPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('invoice_id, amount')
        .eq('business_id', activeBusinessId);

      if (paymentsError) {
        throw paymentsError;
      }

      // Calculate total paid per invoice
      const paidByInvoice: Record<string, number> = {};
      for (const payment of allPayments || []) {
        if (payment.invoice_id) {
          paidByInvoice[payment.invoice_id] = 
            (paidByInvoice[payment.invoice_id] || 0) + Number(payment.amount);
        }
      }

      // Transform to InvoiceForPayment
      return (invoices || []).map((inv) => {
        const totalPaid = paidByInvoice[inv.id] || 0;
        const total = Number(inv.total);
        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          total,
          status: inv.status as InvoiceStatus,
          due_date: inv.due_date,
          client_name: inv.clients?.name || undefined,
          total_paid: totalPaid,
          pending: Math.max(0, total - totalPaid),
        };
      });
    } catch (err) {
      console.error('Error fetching payable invoices:', err);
      toast({
        title: 'Error al cargar facturas',
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return [];
    }
  }, [activeBusinessId, toast]);

  return {
    payments,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    fetchPayments,
    createPayment,
    fetchPayableInvoices,
  };
}
