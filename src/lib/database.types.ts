// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FROM THE LIVE SUPABASE SCHEMA — DO NOT EDIT BY HAND.
//
// Regenerate after any schema change:  npm run gen:types
// (scripts/gen-types.mjs). Source of truth for table shapes; keep the
// convenience types in ./types.ts in sync with it. Generated 25 tables.
// ─────────────────────────────────────────────────────────────────────────────

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      appointment_charges: {
        Row: {
          id: string
          tenant_id: string
          appointment_id: string
          staff_id: string | null
          service_id: string | null
          description: string
          amount: number
          is_upsell: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          appointment_id: string
          staff_id?: string | null
          service_id?: string | null
          description: string
          amount?: number
          is_upsell?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          appointment_id?: string
          staff_id?: string | null
          service_id?: string | null
          description?: string
          amount?: number
          is_upsell?: boolean | null
          created_at?: string | null
        }
      }
      appointment_reminders: {
        Row: {
          id: string
          tenant_id: string
          appointment_id: string
          client_id: string | null
          type: string
          channel: string
          status: string | null
          sent_at: string | null
          error: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          appointment_id: string
          client_id?: string | null
          type: string
          channel: string
          status?: string | null
          sent_at?: string | null
          error?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          appointment_id?: string
          client_id?: string | null
          type?: string
          channel?: string
          status?: string | null
          sent_at?: string | null
          error?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      appointments: {
        Row: {
          id: string
          tenant_id: string
          client_id: string | null
          staff_id: string | null
          service_id: string | null
          start_time: string
          end_time: string
          status: string | null
          total_price: number | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          payment_method: string | null
          tip_amount: number | null
          checked_out_at: string | null
          checked_out_by: string | null
          checked_in_at: string | null
          manage_token: string
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id?: string | null
          staff_id?: string | null
          service_id?: string | null
          start_time: string
          end_time: string
          status?: string | null
          total_price?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          payment_method?: string | null
          tip_amount?: number | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          checked_in_at?: string | null
          manage_token?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string | null
          staff_id?: string | null
          service_id?: string | null
          start_time?: string
          end_time?: string
          status?: string | null
          total_price?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          payment_method?: string | null
          tip_amount?: number | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          checked_in_at?: string | null
          manage_token?: string
        }
      }
      campaigns: {
        Row: {
          id: string
          tenant_id: string
          name: string
          type: string
          template: Json | null
          audience: Json | null
          status: string | null
          metrics: Json | null
          last_sent: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          type?: string
          template?: Json | null
          audience?: Json | null
          status?: string | null
          metrics?: Json | null
          last_sent?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          type?: string
          template?: Json | null
          audience?: Json | null
          status?: string | null
          metrics?: Json | null
          last_sent?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      client_referral_codes: {
        Row: {
          id: string
          code: string
          referrer_name: string
          referrer_email: string
          referred_salon_name: string
          referred_owner_name: string
          referred_owner_email: string
          uses: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          code: string
          referrer_name: string
          referrer_email: string
          referred_salon_name: string
          referred_owner_name: string
          referred_owner_email: string
          uses?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          code?: string
          referrer_name?: string
          referrer_email?: string
          referred_salon_name?: string
          referred_owner_name?: string
          referred_owner_email?: string
          uses?: number | null
          created_at?: string | null
        }
      }
      clients: {
        Row: {
          id: string
          tenant_id: string
          first_name: string
          last_name: string | null
          phone: string | null
          email: string | null
          birthday: string | null
          preferences: Json | null
          allergies: string[] | null
          notes: string | null
          loyalty_points: number | null
          tags: string[] | null
          lifetime_spend: number | null
          visit_count: number | null
          last_visit: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
          photo_url: string | null
          sms_opt_out: boolean | null
        }
        Insert: {
          id?: string
          tenant_id: string
          first_name: string
          last_name?: string | null
          phone?: string | null
          email?: string | null
          birthday?: string | null
          preferences?: Json | null
          allergies?: string[] | null
          notes?: string | null
          loyalty_points?: number | null
          tags?: string[] | null
          lifetime_spend?: number | null
          visit_count?: number | null
          last_visit?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          photo_url?: string | null
          sms_opt_out?: boolean | null
        }
        Update: {
          id?: string
          tenant_id?: string
          first_name?: string
          last_name?: string | null
          phone?: string | null
          email?: string | null
          birthday?: string | null
          preferences?: Json | null
          allergies?: string[] | null
          notes?: string | null
          loyalty_points?: number | null
          tags?: string[] | null
          lifetime_spend?: number | null
          visit_count?: number | null
          last_visit?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          photo_url?: string | null
          sms_opt_out?: boolean | null
        }
      }
      conversations: {
        Row: {
          id: string
          tenant_id: string
          client_id: string | null
          channel: string | null
          status: string | null
          assigned_to: string | null
          last_message: string | null
          last_message_at: string | null
          unread_count: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id?: string | null
          channel?: string | null
          status?: string | null
          assigned_to?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string | null
          channel?: string | null
          status?: string | null
          assigned_to?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      credit_redemptions: {
        Row: {
          id: string
          credit_id: string
          tenant_id: string
          amount: number
          compensated: boolean
          stripe_credit_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          credit_id: string
          tenant_id: string
          amount: number
          compensated?: boolean
          stripe_credit_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          credit_id?: string
          tenant_id?: string
          amount?: number
          compensated?: boolean
          stripe_credit_id?: string | null
          created_at?: string
        }
      }
      feedback: {
        Row: {
          id: string
          tenant_id: string
          staff_id: string | null
          page: string
          type: string
          message: string
          rating: number | null
          status: string
          created_at: string | null
          reviewed_at: string | null
          admin_notes: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          staff_id?: string | null
          page: string
          type?: string
          message: string
          rating?: number | null
          status?: string
          created_at?: string | null
          reviewed_at?: string | null
          admin_notes?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          staff_id?: string | null
          page?: string
          type?: string
          message?: string
          rating?: number | null
          status?: string
          created_at?: string | null
          reviewed_at?: string | null
          admin_notes?: string | null
        }
      }
      gift_cards: {
        Row: {
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
          status: string | null
          expires_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          code: string
          initial_amount: number
          balance: number
          purchaser_name?: string | null
          purchaser_email?: string | null
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          status?: string | null
          expires_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          code?: string
          initial_amount?: number
          balance?: number
          purchaser_name?: string | null
          purchaser_email?: string | null
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          status?: string | null
          expires_at?: string | null
          created_at?: string | null
        }
      }
      glowup_credits: {
        Row: {
          id: string
          code: string
          amount: number
          balance: number
          status: string
          recipient_name: string | null
          recipient_email: string | null
          source: string
          referral_log_id: string | null
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          code: string
          amount?: number
          balance?: number
          status?: string
          recipient_name?: string | null
          recipient_email?: string | null
          source?: string
          referral_log_id?: string | null
          created_at?: string
          expires_at?: string
        }
        Update: {
          id?: string
          code?: string
          amount?: number
          balance?: number
          status?: string
          recipient_name?: string | null
          recipient_email?: string | null
          source?: string
          referral_log_id?: string | null
          created_at?: string
          expires_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          business_name: string
          industry: string
          address: string
          city: string
          state: string
          country: string
          phone: string | null
          email: string | null
          website: string | null
          rating: number | null
          review_count: number | null
          google_maps_url: string | null
          source: string
          status: string
          created_at: string
          enrichment_attempted: boolean | null
        }
        Insert: {
          id?: string
          business_name: string
          industry?: string
          address?: string
          city?: string
          state?: string
          country?: string
          phone?: string | null
          email?: string | null
          website?: string | null
          rating?: number | null
          review_count?: number | null
          google_maps_url?: string | null
          source?: string
          status?: string
          created_at?: string
          enrichment_attempted?: boolean | null
        }
        Update: {
          id?: string
          business_name?: string
          industry?: string
          address?: string
          city?: string
          state?: string
          country?: string
          phone?: string | null
          email?: string | null
          website?: string | null
          rating?: number | null
          review_count?: number | null
          google_maps_url?: string | null
          source?: string
          status?: string
          created_at?: string
          enrichment_attempted?: boolean | null
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          tenant_id: string
          sender_type: string
          sender_name: string | null
          content: string
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          tenant_id: string
          sender_type?: string
          sender_name?: string | null
          content: string
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          tenant_id?: string
          sender_type?: string
          sender_name?: string | null
          content?: string
          metadata?: Json | null
          created_at?: string | null
        }
      }
      outreach_campaigns: {
        Row: {
          id: string
          salon_name: string
          owner_name: string
          owner_email: string
          phone: string | null
          city: string | null
          state: string | null
          referral_code: string | null
          status: string
          signed_up: boolean | null
          sent_at: string | null
          created_at: string | null
          template_id: string | null
          follow_up_count: number | null
          last_follow_up_at: string | null
          last_template_id: string | null
          signed_up_at: string | null
          signed_up_tenant_id: string | null
        }
        Insert: {
          id?: string
          salon_name: string
          owner_name: string
          owner_email: string
          phone?: string | null
          city?: string | null
          state?: string | null
          referral_code?: string | null
          status?: string
          signed_up?: boolean | null
          sent_at?: string | null
          created_at?: string | null
          template_id?: string | null
          follow_up_count?: number | null
          last_follow_up_at?: string | null
          last_template_id?: string | null
          signed_up_at?: string | null
          signed_up_tenant_id?: string | null
        }
        Update: {
          id?: string
          salon_name?: string
          owner_name?: string
          owner_email?: string
          phone?: string | null
          city?: string | null
          state?: string | null
          referral_code?: string | null
          status?: string
          signed_up?: boolean | null
          sent_at?: string | null
          created_at?: string | null
          template_id?: string | null
          follow_up_count?: number | null
          last_follow_up_at?: string | null
          last_template_id?: string | null
          signed_up_at?: string | null
          signed_up_tenant_id?: string | null
        }
      }
      packages: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          type: string | null
          services: Json | null
          price: number
          original_price: number | null
          validity_days: number | null
          max_redemptions: number | null
          times_sold: number | null
          revenue_generated: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          type?: string | null
          services?: Json | null
          price?: number
          original_price?: number | null
          validity_days?: number | null
          max_redemptions?: number | null
          times_sold?: number | null
          revenue_generated?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          type?: string | null
          services?: Json | null
          price?: number
          original_price?: number | null
          validity_days?: number | null
          max_redemptions?: number | null
          times_sold?: number | null
          revenue_generated?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      platform_settings: {
        Row: {
          key: string
          value: string
          updated_at: string | null
        }
        Insert: {
          key: string
          value: string
          updated_at?: string | null
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string | null
        }
      }
      referral_codes: {
        Row: {
          id: string
          tenant_id: string
          code: string
          reward_type: string | null
          reward_value: number | null
          uses: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          code: string
          reward_type?: string | null
          reward_value?: number | null
          uses?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          code?: string
          reward_type?: string | null
          reward_value?: number | null
          uses?: number | null
          created_at?: string | null
        }
      }
      referral_log: {
        Row: {
          id: string
          referrer_tenant_id: string | null
          referred_tenant_id: string | null
          code: string
          reward_applied: boolean | null
          created_at: string | null
          client_referrer_id: string | null
          client_reward_amount: number | null
          client_reward_status: string | null
          client_referrer_name: string | null
          client_referrer_email: string | null
        }
        Insert: {
          id?: string
          referrer_tenant_id?: string | null
          referred_tenant_id?: string | null
          code: string
          reward_applied?: boolean | null
          created_at?: string | null
          client_referrer_id?: string | null
          client_reward_amount?: number | null
          client_reward_status?: string | null
          client_referrer_name?: string | null
          client_referrer_email?: string | null
        }
        Update: {
          id?: string
          referrer_tenant_id?: string | null
          referred_tenant_id?: string | null
          code?: string
          reward_applied?: boolean | null
          created_at?: string | null
          client_referrer_id?: string | null
          client_reward_amount?: number | null
          client_reward_status?: string | null
          client_referrer_name?: string | null
          client_referrer_email?: string | null
        }
      }
      service_history: {
        Row: {
          id: string
          tenant_id: string
          client_id: string | null
          staff_id: string | null
          service_id: string | null
          appointment_id: string | null
          date: string
          notes: string | null
          before_photo_urls: string[] | null
          after_photo_urls: string[] | null
          specifications: Json | null
          satisfaction: number | null
          total_paid: number | null
          created_at: string | null
          formula: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id?: string | null
          staff_id?: string | null
          service_id?: string | null
          appointment_id?: string | null
          date?: string
          notes?: string | null
          before_photo_urls?: string[] | null
          after_photo_urls?: string[] | null
          specifications?: Json | null
          satisfaction?: number | null
          total_paid?: number | null
          created_at?: string | null
          formula?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string | null
          staff_id?: string | null
          service_id?: string | null
          appointment_id?: string | null
          date?: string
          notes?: string | null
          before_photo_urls?: string[] | null
          after_photo_urls?: string[] | null
          specifications?: Json | null
          satisfaction?: number | null
          total_paid?: number | null
          created_at?: string | null
          formula?: string | null
        }
      }
      services: {
        Row: {
          id: string
          tenant_id: string
          name: string
          category: string | null
          description: string | null
          duration_minutes: number
          price: number
          is_active: boolean | null
          sort_order: number | null
          created_at: string | null
          updated_at: string | null
          image_url: string | null
          commission_rate: number | null
          price_addons: Json | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          category?: string | null
          description?: string | null
          duration_minutes?: number
          price?: number
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          image_url?: string | null
          commission_rate?: number | null
          price_addons?: Json | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          category?: string | null
          description?: string | null
          duration_minutes?: number
          price?: number
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          image_url?: string | null
          commission_rate?: number | null
          price_addons?: Json | null
        }
      }
      social_posts: {
        Row: {
          id: string
          tenant_id: string
          content: string | null
          image_urls: string[] | null
          platforms: string[] | null
          status: string | null
          scheduled_at: string | null
          published_at: string | null
          template_type: string | null
          metrics: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          content?: string | null
          image_urls?: string[] | null
          platforms?: string[] | null
          status?: string | null
          scheduled_at?: string | null
          published_at?: string | null
          template_type?: string | null
          metrics?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          content?: string | null
          image_urls?: string[] | null
          platforms?: string[] | null
          status?: string | null
          scheduled_at?: string | null
          published_at?: string | null
          template_type?: string | null
          metrics?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      staff: {
        Row: {
          id: string
          tenant_id: string
          user_id: string | null
          name: string
          role: string
          email: string | null
          phone: string | null
          specialties: string[] | null
          schedule: Json | null
          commission_rate: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          photo_url: string | null
          agreement_signature: string | null
          agreement_signed_at: string | null
          pin: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id?: string | null
          name: string
          role?: string
          email?: string | null
          phone?: string | null
          specialties?: string[] | null
          schedule?: Json | null
          commission_rate?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          photo_url?: string | null
          agreement_signature?: string | null
          agreement_signed_at?: string | null
          pin?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string | null
          name?: string
          role?: string
          email?: string | null
          phone?: string | null
          specialties?: string[] | null
          schedule?: Json | null
          commission_rate?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          photo_url?: string | null
          agreement_signature?: string | null
          agreement_signed_at?: string | null
          pin?: string | null
        }
      }
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          business_type: string | null
          plan: string | null
          settings: Json | null
          created_at: string | null
          updated_at: string | null
          phone: string | null
          email: string | null
          website: string | null
          address: string | null
          logo_url: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          current_period_end: string | null
          is_active: boolean | null
          deleted_at: string | null
          deletion_scheduled_at: string | null
          referred_by: string | null
          timezone: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          business_type?: string | null
          plan?: string | null
          settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          logo_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          current_period_end?: string | null
          is_active?: boolean | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          referred_by?: string | null
          timezone?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          business_type?: string | null
          plan?: string | null
          settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          logo_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          current_period_end?: string | null
          is_active?: boolean | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          referred_by?: string | null
          timezone?: string | null
        }
      }
      view_as_state: {
        Row: {
          user_id: string
          target_tenant_id: string
          activated_at: string | null
        }
        Insert: {
          user_id: string
          target_tenant_id: string
          activated_at?: string | null
        }
        Update: {
          user_id?: string
          target_tenant_id?: string
          activated_at?: string | null
        }
      }
      waitlist: {
        Row: {
          id: string
          tenant_id: string
          client_id: string | null
          service_id: string | null
          staff_id: string | null
          preferred_date: string | null
          preferred_time_start: string | null
          preferred_time_end: string | null
          status: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id?: string | null
          service_id?: string | null
          staff_id?: string | null
          preferred_date?: string | null
          preferred_time_start?: string | null
          preferred_time_end?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string | null
          service_id?: string | null
          staff_id?: string | null
          preferred_date?: string | null
          preferred_time_start?: string | null
          preferred_time_end?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
        }
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}

// Convenience helpers:  type Client = Tables<'clients'>
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
