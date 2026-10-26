create table if not exists events (
  id serial primary key,
  title text not null,
  event_type text,
  city text,
  event_date date,
  guest_count int,
  budget_total numeric,
  brief text,
  client_name text,
  client_phone text,
  rsvp_token text unique not null default md5(cast(random() as text) || cast(clock_timestamp() as text)),
  created_at timestamptz default now()
);

create table if not exists plan_items (
  id serial primary key,
  event_id int not null references events(id) on delete cascade,
  title text not null,
  category text,
  due_date date,
  status text not null default 'todo',
  notes text
);

create table if not exists vendors (
  id serial primary key,
  event_id int not null references events(id) on delete cascade,
  category text not null,
  name text,
  phone text,
  upi_id text,
  status text not null default 'not_contacted',
  quoted_amount numeric,
  agreed_amount numeric,
  advance_percent numeric default 50,
  paid_amount numeric default 0,
  last_reply text,
  last_summary text
);

create table if not exists budget_items (
  id serial primary key,
  event_id int not null references events(id) on delete cascade,
  category text not null,
  planned_amount numeric default 0
);

create table if not exists drafts (
  id serial primary key,
  event_id int not null references events(id) on delete cascade,
  type text not null,
  vendor_id int,
  guest_id int,
  body text not null,
  payload jsonb,
  status text not null default 'pending',
  created_at timestamptz default now(),
  approved_at timestamptz
);

create table if not exists guests (
  id serial primary key,
  event_id int not null references events(id) on delete cascade,
  name text not null,
  phone text,
  rsvp_status text not null default 'pending',
  party_size int not null default 1,
  dietary text
)
