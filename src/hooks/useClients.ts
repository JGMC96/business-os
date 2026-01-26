import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/contexts/BusinessContext';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/types/database';

export interface ClientFormData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

interface UseClientsReturn {
  clients: Client[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showInactive: boolean;
  setShowInactive: (show: boolean) => void;
  fetchClients: () => Promise<void>;
  createClient: (data: ClientFormData) => Promise<boolean>;
  updateClient: (id: string, data: ClientFormData) => Promise<boolean>;
  toggleClientStatus: (id: string, currentStatus: boolean) => Promise<boolean>;
}

// Normalize data before saving
function normalizeClientData(data: ClientFormData): ClientFormData {
  return {
    name: data.name.trim(),
    email: data.email?.trim().toLowerCase() || undefined,
    phone: data.phone?.replace(/[\s\-]/g, '') || undefined,
    company: data.company?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
  };
}

export function useClients(): UseClientsReturn {
  const { activeBusinessId, user } = useBusiness();
  const { toast } = useToast();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Fetch clients with race condition protection
  const fetchClients = useCallback(async () => {
    if (!activeBusinessId) {
      setClients([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('clients')
        .select('*')
        .eq('business_id', activeBusinessId)
        .order('name', { ascending: true });

      // Filter by active status
      if (!showInactive) {
        query = query.eq('is_active', true);
      }

      // Search filter using OR for multiple columns
      if (searchTerm.trim()) {
        const term = searchTerm.trim();
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      setClients(data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError(err instanceof Error ? err : new Error('Error al cargar clientes'));
    } finally {
      setIsLoading(false);
    }
  }, [activeBusinessId, searchTerm, showInactive]);

  // Effect with race condition protection
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!activeBusinessId) {
        setClients([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('clients')
          .select('*')
          .eq('business_id', activeBusinessId)
          .order('name', { ascending: true });

        if (!showInactive) {
          query = query.eq('is_active', true);
        }

        if (searchTerm.trim()) {
          const term = searchTerm.trim();
          query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
        }

        const { data, error: fetchError } = await query;

        if (cancelled) return;

        if (fetchError) {
          throw fetchError;
        }

        setClients(data || []);
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching clients:', err);
        setError(err instanceof Error ? err : new Error('Error al cargar clientes'));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, searchTerm, showInactive]);

  // Create client
  const createClient = useCallback(async (data: ClientFormData): Promise<boolean> => {
    if (!activeBusinessId || !user) {
      toast({
        title: 'Error',
        description: 'No hay negocio activo',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const normalizedData = normalizeClientData(data);
      
      const { error: insertError } = await supabase
        .from('clients')
        .insert({
          business_id: activeBusinessId,
          created_by: user.id,
          name: normalizedData.name,
          email: normalizedData.email || null,
          phone: normalizedData.phone || null,
          company: normalizedData.company || null,
          notes: normalizedData.notes || null,
        });

      if (insertError) {
        throw insertError;
      }

      toast({
        title: 'Cliente creado',
        description: 'El cliente se ha creado correctamente',
      });

      await fetchClients();
      return true;
    } catch (err) {
      console.error('Error creating client:', err);
      toast({
        title: 'Error al crear cliente',
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeBusinessId, user, fetchClients, toast]);

  // Update client
  const updateClient = useCallback(async (id: string, data: ClientFormData): Promise<boolean> => {
    if (!activeBusinessId) {
      toast({
        title: 'Error',
        description: 'No hay negocio activo',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const normalizedData = normalizeClientData(data);
      
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          name: normalizedData.name,
          email: normalizedData.email || null,
          phone: normalizedData.phone || null,
          company: normalizedData.company || null,
          notes: normalizedData.notes || null,
        })
        .eq('id', id)
        .eq('business_id', activeBusinessId);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: 'Cliente actualizado',
        description: 'Los cambios se han guardado correctamente',
      });

      await fetchClients();
      return true;
    } catch (err) {
      console.error('Error updating client:', err);
      toast({
        title: 'Error al actualizar',
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeBusinessId, fetchClients, toast]);

  // Toggle client status (soft delete/reactivate)
  const toggleClientStatus = useCallback(async (id: string, currentStatus: boolean): Promise<boolean> => {
    if (!activeBusinessId) {
      toast({
        title: 'Error',
        description: 'No hay negocio activo',
        variant: 'destructive',
      });
      return false;
    }

    const newStatus = !currentStatus;
    const action = newStatus ? 'reactivado' : 'desactivado';

    try {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ is_active: newStatus })
        .eq('id', id)
        .eq('business_id', activeBusinessId);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: `Cliente ${action}`,
        description: `El cliente ha sido ${action} correctamente`,
      });

      await fetchClients();
      return true;
    } catch (err) {
      console.error('Error toggling client status:', err);
      toast({
        title: `Error al ${newStatus ? 'reactivar' : 'desactivar'}`,
        description: err instanceof Error ? err.message : 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeBusinessId, fetchClients, toast]);

  return {
    clients,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    showInactive,
    setShowInactive,
    fetchClients,
    createClient,
    updateClient,
    toggleClientStatus,
  };
}
