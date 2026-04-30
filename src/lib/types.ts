/* ─── TypeScript types for Supabase tables ─── */

export interface Tenant {
  id: string
  name: string
  slug: string
  business_type: string
  plan: string
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  logo_url: string | null
  settings: Record<string, unknown>
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | null
  trial_ends_at: string | null
  current_period_end: string | null
  is_active: boolean
  deleted_at: string | null
  deletion_scheduled_at: string | null
  created_at: string
  updated_at: string
}

export interface Staff {
  id: string
  tenant_id: string
  user_id: string | null
  name: string
  role: 'owner' | 'manager' | 'technician'
  email: string | null
  phone: string | null
  photo_url: string | null
  specialties: string[]
  schedule: Record<string, unknown>
  commission_rate: number
  is_active: boolean
  pin: string | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  tenant_id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
  birthday: string | null
  preferences: Record<string, unknown>
  allergies: string[]
  notes: string | null
  photo_url: string | null
  loyalty_points: number
  tags: string[]
  lifetime_spend: number
  visit_count: number
  last_visit: string | null
  status: 'active' | 'inactive' | 'at_risk' | 'new'
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  tenant_id: string
  name: string
  category: string
  description: string | null
  duration_minutes: number
  price: number
  commission_rate: number | null
  image_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Appointment {
  id: string
  tenant_id: string
  client_id: string | null
  staff_id: string | null
  service_id: string | null
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  total_price: number | null
  notes: string | null
  payment_method: 'cash' | 'card' | 'mixed' | 'other' | null
  tip_amount: number
  checked_out_at: string | null
  checked_out_by: string | null
  created_at: string
  updated_at: string
  // Joined fields
  client?: Client
  staff_member?: Staff
  service?: Service
  charges?: AppointmentCharge[]
}

export interface AppointmentCharge {
  id: string
  tenant_id: string
  appointment_id: string
  staff_id: string | null
  service_id: string | null
  description: string
  amount: number
  is_upsell: boolean
  created_at: string
  service?: Service
}

export interface Campaign {
  id: string
  tenant_id: string
  name: string
  type: 'birthday' | 'win_back' | 'rebooking' | 'review' | 'promo' | 'referral' | 'holiday' | 'fill_openings'
  template: Record<string, unknown>
  audience: Record<string, unknown>
  status: 'draft' | 'active' | 'paused' | 'completed'
  metrics: {
    sent: number
    opened: number
    booked: number
    revenue: number
  }
  last_sent: string | null
  created_at: string
  updated_at: string
}

export interface ServiceHistory {
  id: string
  tenant_id: string
  client_id: string
  staff_id: string | null
  service_id: string | null
  appointment_id: string | null
  date: string
  notes: string | null
  formula: string | null
  before_photo_urls: string[]
  after_photo_urls: string[]
  specifications: Record<string, unknown>
  satisfaction: number | null
  total_paid: number
  created_at: string
  // Joined fields
  staff_member?: Staff
  service?: Service
}

export interface SocialPost {
  id: string
  tenant_id: string
  content: string | null
  image_urls: string[]
  platforms: string[]
  status: 'draft' | 'scheduled' | 'published'
  scheduled_at: string | null
  published_at: string | null
  template_type: string | null
  metrics: {
    likes: number
    comments: number
    shares: number
    reach: number
  }
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  tenant_id: string
  client_id: string | null
  channel: 'sms' | 'instagram' | 'facebook' | 'web'
  status: 'open' | 'closed' | 'archived'
  assigned_to: string | null
  last_message: string | null
  last_message_at: string
  unread_count: number
  created_at: string
  updated_at: string
  // Joined fields
  client?: Client
}

export interface Message {
  id: string
  conversation_id: string
  tenant_id: string
  sender_type: 'client' | 'staff' | 'bot'
  sender_name: string | null
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface WaitlistEntry {
  id: string
  tenant_id: string
  client_id: string
  service_id: string | null
  staff_id: string | null
  preferred_date: string | null
  preferred_time_start: string | null
  preferred_time_end: string | null
  status: 'waiting' | 'notified' | 'booked' | 'expired'
  notes: string | null
  created_at: string
  // Joined
  client?: Client
  service?: Service
  staff_member?: Staff
}

export interface Package {
  id: string
  tenant_id: string
  name: string
  description: string | null
  type: 'bundle' | 'membership'
  services: { service_id: string; quantity: number; name?: string }[]
  price: number
  original_price: number | null
  validity_days: number
  max_redemptions: number | null
  times_sold: number
  revenue_generated: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface GiftCard {
  id: string
  tenant_id: string
  code: string
  initial_amount: number
  balance: number
  purchaser_name: string | null
  purchaser_email: string | null
  recipient_name: string | null
  recipient_email: string | null
  message: string | null
  status: 'active' | 'redeemed' | 'expired'
  expires_at: string | null
  created_at: string
}
