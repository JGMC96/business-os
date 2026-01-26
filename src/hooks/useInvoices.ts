import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/contexts/BusinessContext';
import { useToast } from '@/hooks/use-toast';
import type { Invoice, InvoiceStatus } from '@/types/database';

export interface InvoiceWithClient extends Invoice {
  client_name?: string;
}

export interface InvoiceItemInput {
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CreateInvoiceData {
  client_id: string;
  invoice_number: string;
  due_date?: string;
  notes?: string;
  items: InvoiceItemInput[];
  taxRate: number;
}

interface UseInvoicesReturn {
  invoices: InvoiceWithClient[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: InvoiceStatus | 'all';
  setStatusFilter: (status: InvoiceStatus | 'all') => void;
  fetchInvoices: () => Promise<void>;
  generateInvoiceNumber: () => Promise<string | null>;
  createInvoice: (data: CreateInvoiceData) => Promise<boolean>;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<boolean>;
}

// Sanitize search term to prevent .or() parsing issues
function sanitizeSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[,();]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useInvoices(): UseInvoicesReturn {
  const { activeBusinessId, user } = useBusiness();
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');

  // Request ID counter for race condition protection
  const requestIdRef = useRef(0);

  // Single unified fetch function with race condition protection
  const runFetch = useCallback(async (requestId: number) => {
    if (!activeBusinessId) {
      if (requestId === requestIdRef.current) {
        setInvoices([]);
        setIsLoading(false);
      }
      return;
    }

    try {
      // Build query with join to clients for client name
      let query = supabase
        .from('invoices')
        .select(`
          *,
          clients!invoices_client_id_fkey (name)
        `)
        .eq('business_id', activeBusinessId)
        .order('created_at', { ascending: false });

      // Status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Search filter (invoice_number or client name)
      const sanitizedTerm = sanitizeSearchTerm(searchTerm);
      if (sanitizedTerm) {
        query = query.or(
          `invoice_number.ilike.%${sanitizedTerm}%`
        );
      }

      const { data, error: fetchError } = await query;

      // Only update state if this is still the current request
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (fetchError) {
        throw fetchError;
      }

      // Map data to include client_name
      const mappedInvoices: InvoiceWithClient[] = (data || []).map((invoice: any) => ({
        ...invoice,
        client_name: invoice.clients?.name || null,
        clients: undefined, // Remove the nested object
      }));

      setInvoices(mappedInvoices);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      console.error('Error fetching invoices:', err);
      setError(err instanceof Error ? err : new Error('Error al cargar facturas'));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeBusinessId, searchTerm, statusFilter]);

  // Public fetch function that increments request ID
  const fetchInvoices = useCallback(async () => {
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

  // Generate invoice number via RPC
  const generateInvoiceNumber = useCallback(async (): Promise<string | null> => {
    if (!activeBusinessId) {
      toast({
        title: 'Error',
        description: 'No hay negocio activo',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('generate_invoice_number', {
        _business_id: activeBusinessId,
      });

      if (rpcError) {
        throw rpcError;
      }

      return data as string;
    } catch (err) {
      console.error('Error generating invoice number:', err);
      toast({
        title: 'Error al generar número de factura',
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return null;
    }
  }, [activeBusinessId, toast]);

  // Create invoice with items
  const createInvoice = useCallback(async (data: CreateInvoiceData): Promise<boolean> => {
    if (!activeBusinessId || !user) {
      toast({
        title: 'Error',
        description: 'No hay negocio activo',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Calculate totals
      const subtotal = data.items.reduce((sum, item) => {
        return sum + (item.quantity * item.unit_price);
      }, 0);
      const tax = subtotal * (data.taxRate / 100);
      const total = subtotal + tax;

      // Insert invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          business_id: activeBusinessId,
          client_id: data.client_id,
          invoice_number: data.invoice_number,
          status: 'draft' as InvoiceStatus,
          subtotal,
          tax,
          total,
          due_date: data.due_date || null,
          notes: data.notes || null,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (invoiceError) {
        throw invoiceError;
      }

      // Insert invoice items
      const itemsToInsert = data.items.map((item) => ({
        invoice_id: invoice.id,
        product_id: item.product_id || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) {
        // Mark invoice as cancelled instead of deleting (soft delete pattern)
        await supabase
          .from('invoices')
          .update({ status: 'cancelled' as InvoiceStatus })
          .eq('id', invoice.id)
          .eq('business_id', activeBusinessId);
        throw itemsError;
      }

      toast({
        title: 'Factura creada',
        description: `Factura ${data.invoice_number} creada correctamente`,
      });

      await fetchInvoices();
      return true;
    } catch (err) {
      console.error('Error creating invoice:', err);
      toast({
        title: 'Error al crear factura',
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeBusinessId, user, fetchInvoices, toast]);

  // Update invoice status
  const updateInvoiceStatus = useCallback(async (id: string, status: InvoiceStatus): Promise<boolean> => {
    if (!activeBusinessId) {
      toast({
        title: 'Error',
        description: 'No hay negocio activo',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const updateData: Record<string, unknown> = { status };
      
      // If marking as paid, set paid_at
      if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id)
        .eq('business_id', activeBusinessId);

      if (updateError) {
        throw updateError;
      }

      const statusLabels: Record<InvoiceStatus, string> = {
        draft: 'Borrador',
        sent: 'Enviada',
        paid: 'Pagada',
        overdue: 'Vencida',
        cancelled: 'Cancelada',
      };

      toast({
        title: 'Estado actualizado',
        description: `Factura marcada como ${statusLabels[status]}`,
      });

      await fetchInvoices();
      return true;
    } catch (err) {
      console.error('Error updating invoice status:', err);
      toast({
        title: 'Error al actualizar estado',
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeBusinessId, fetchInvoices, toast]);

  return {
    invoices,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    fetchInvoices,
    generateInvoiceNumber,
    createInvoice,
    updateInvoiceStatus,
  };
}
