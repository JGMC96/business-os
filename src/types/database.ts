// Database types for TotalBusiness AI
// These types mirror the Supabase schema

export type AppRole = 'owner' | 'admin' | 'staff';
export type SubscriptionPlan = 'free' | 'trial' | 'pro' | 'business';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';
export type ModuleType = 'clients' | 'products' | 'invoicing' | 'payments' | 'ai_advisor' | 'reports';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  industry: string | null;
  currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  invited_at: string | null;
  joined_at: string | null;
}

export interface Subscription {
  id: string;
  business_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessModule {
  id: string;
  business_id: string;
  module: ModuleType;
  is_enabled: boolean;
  limits: Record<string, unknown>;
}

export interface Client {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  category: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  business_id: string;
  client_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  subtotal: number;
  tax: number;
  total: number;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Payment {
  id: string;
  business_id: string;
  invoice_id: string | null;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  business_id: string | null;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// Extended types with relations
export interface BusinessWithMembership extends Business {
  role: AppRole;
  subscription?: Subscription;
  modules?: BusinessModule[];
}
