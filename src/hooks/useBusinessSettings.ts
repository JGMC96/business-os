import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/contexts/BusinessContext';
import type { BusinessSettings } from '@/types/database';

interface UseBusinessSettingsReturn {
  settings: BusinessSettings | null;
  isLoading: boolean;
  taxRate: number;
}

export function useBusinessSettings(): UseBusinessSettingsReturn {
  const { activeBusinessId } = useBusiness();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeBusinessId) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('business_settings')
          .select('*')
          .eq('business_id', activeBusinessId)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows found, which is OK (use defaults)
          console.error('Error fetching business settings:', error);
        }

        setSettings(data);
      } catch (err) {
        console.error('Error fetching business settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [activeBusinessId]);

  // Default tax rate if no settings exist
  const taxRate = settings?.tax_rate ?? 16;

  return { settings, isLoading, taxRate };
}
