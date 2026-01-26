import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import type { 
  Business, 
  BusinessMember, 
  BusinessModule, 
  Subscription, 
  AppRole, 
  ModuleType,
  BusinessWithMembership 
} from '@/types/database';

interface BusinessContextType {
  // Auth state
  user: User | null;
  isAuthLoading: boolean;
  
  // Business state
  activeBusinessId: string | null;
  activeBusiness: BusinessWithMembership | null;
  userBusinesses: BusinessWithMembership[];
  userRole: AppRole | null;
  enabledModules: ModuleType[];
  
  // Actions
  setActiveBusiness: (businessId: string) => Promise<void>;
  refreshBusinesses: () => Promise<void>;
  signOut: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

const ACTIVE_BUSINESS_KEY = 'totalbusiness_active_business_id';

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // Business state
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeBusiness, setActiveBusinessState] = useState<BusinessWithMembership | null>(null);
  const [userBusinesses, setUserBusinesses] = useState<BusinessWithMembership[]>([]);
  const [enabledModules, setEnabledModules] = useState<ModuleType[]>([]);

  // Derived state
  const userRole = activeBusiness?.role ?? null;

  // Fetch user's businesses with memberships
  const fetchUserBusinesses = useCallback(async (userId: string): Promise<BusinessWithMembership[]> => {
    const { data: memberships, error } = await supabase
      .from('business_members')
      .select(`
        role,
        business_id,
        businesses (
          id,
          name,
          slug,
          logo_url,
          industry,
          currency,
          timezone,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching businesses:', error);
      return [];
    }

    if (!memberships) return [];

    return memberships
      .filter((m): m is typeof m & { businesses: Business } => m.businesses !== null)
      .map((m) => ({
        ...m.businesses,
        role: m.role as AppRole,
      }));
  }, []);

  // Fetch modules for a business
  const fetchBusinessModules = useCallback(async (businessId: string): Promise<ModuleType[]> => {
    const { data, error } = await supabase
      .from('business_modules')
      .select('module, is_enabled')
      .eq('business_id', businessId)
      .eq('is_enabled', true);

    if (error) {
      console.error('Error fetching modules:', error);
      return [];
    }

    return (data || []).map((m) => m.module as ModuleType);
  }, []);

  // Set active business
  const handleSetActiveBusiness = useCallback(async (businessId: string) => {
    const business = userBusinesses.find((b) => b.id === businessId);
    if (!business) {
      console.error('Business not found in user businesses');
      return;
    }

    setActiveBusinessId(businessId);
    setActiveBusinessState(business);
    localStorage.setItem(ACTIVE_BUSINESS_KEY, businessId);

    // Fetch enabled modules
    const modules = await fetchBusinessModules(businessId);
    setEnabledModules(modules);
  }, [userBusinesses, fetchBusinessModules]);

  // Refresh businesses
  const refreshBusinesses = useCallback(async () => {
    if (!user) return;

    const businesses = await fetchUserBusinesses(user.id);
    setUserBusinesses(businesses);

    // If active business no longer accessible, clear it
    if (activeBusinessId && !businesses.find((b) => b.id === activeBusinessId)) {
      setActiveBusinessId(null);
      setActiveBusinessState(null);
      setEnabledModules([]);
      localStorage.removeItem(ACTIVE_BUSINESS_KEY);
    }
  }, [user, activeBusinessId, fetchUserBusinesses]);

  // Sign out
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setActiveBusinessId(null);
    setActiveBusinessState(null);
    setUserBusinesses([]);
    setEnabledModules([]);
    localStorage.removeItem(ACTIVE_BUSINESS_KEY);
    navigate('/');
  }, [navigate]);

  // Initialize auth listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setIsAuthLoading(false);

      if (!session?.user) {
        setActiveBusinessId(null);
        setActiveBusinessState(null);
        setUserBusinesses([]);
        setEnabledModules([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch businesses when user changes
  useEffect(() => {
    if (!user) return;

    const loadBusinesses = async () => {
      const businesses = await fetchUserBusinesses(user.id);
      setUserBusinesses(businesses);

      // Try to restore active business from localStorage
      const storedBusinessId = localStorage.getItem(ACTIVE_BUSINESS_KEY);
      const storedBusiness = businesses.find((b) => b.id === storedBusinessId);

      if (storedBusiness) {
        setActiveBusinessId(storedBusiness.id);
        setActiveBusinessState(storedBusiness);
        const modules = await fetchBusinessModules(storedBusiness.id);
        setEnabledModules(modules);
      } else if (businesses.length === 1) {
        // Auto-select if only one business
        setActiveBusinessId(businesses[0].id);
        setActiveBusinessState(businesses[0]);
        localStorage.setItem(ACTIVE_BUSINESS_KEY, businesses[0].id);
        const modules = await fetchBusinessModules(businesses[0].id);
        setEnabledModules(modules);
      }
    };

    loadBusinesses();
  }, [user, fetchUserBusinesses, fetchBusinessModules]);

  const value: BusinessContextType = {
    user,
    isAuthLoading,
    activeBusinessId,
    activeBusiness,
    userBusinesses,
    userRole,
    enabledModules,
    setActiveBusiness: handleSetActiveBusiness,
    refreshBusinesses,
    signOut,
  };

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
