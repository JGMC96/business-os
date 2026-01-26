import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/contexts/BusinessContext';
import { toast } from 'sonner';

interface ProfileData {
  full_name: string | null;
  avatar_url: string | null;
}

interface ProfileFormData {
  full_name: string;
  avatar_url: string;
}

interface UseProfileSettingsReturn {
  profile: ProfileData | null;
  isLoading: boolean;
  updateProfile: (data: ProfileFormData) => Promise<boolean>;
  isUpdating: boolean;
  refetch: () => Promise<void>;
}

export function useProfileSettings(): UseProfileSettingsReturn {
  const { user } = useBusiness();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      }

      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = async (data: ProfileFormData): Promise<boolean> => {
    if (!user) return false;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: data.full_name.trim() || null,
          avatar_url: data.avatar_url.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        toast.error('Error al guardar perfil');
        return false;
      }

      // Update local state
      setProfile({
        full_name: data.full_name.trim() || null,
        avatar_url: data.avatar_url.trim() || null,
      });

      toast.success('Perfil actualizado');
      return true;
    } catch (err) {
      console.error('Error updating profile:', err);
      toast.error('Error al guardar perfil');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    profile,
    isLoading,
    updateProfile,
    isUpdating,
    refetch: fetchProfile,
  };
}
