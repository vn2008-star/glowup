-- outreach_campaigns: tracks bulk outreach emails to salon owners
create table if not exists outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  salon_name text not null,
  owner_name text not null,
  owner_email text not null,
  phone text,
  city text,
  state text,
  referral_code text,
  status text not null default 'pending', -- sent, skipped_active, skipped_duplicate, failed
  signed_up boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Index for duplicate detection
create index if not exists idx_outreach_owner_email on outreach_campaigns(owner_email);

-- Enable RLS
alter table outreach_campaigns enable row level security;
