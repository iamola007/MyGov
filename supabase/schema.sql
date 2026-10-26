-- mygov.com — schema (Postgres / Supabase)
-- MVP scope: auth/profiles, discussion forum, moderation. RLS enforced on every table.
-- Government project tracker included (populated later via import pipeline from
-- BudgIT / Open Treasury Portal) but not the app's MVP focus.
-- AI chatbot, fact-checking, and legislative tracking tables are extension points —
-- noted at the bottom, not scaffolded yet.

-- ── Users & profiles ────────────────────────────────────────────
-- Supabase's built-in auth.users handles credentials (phone/OTP or email).
-- This table holds public-facing profile data.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  state text,              -- Nigerian state, for localized feeds later
  lga text,                -- local government area
  role text not null default 'citizen' check (role in ('citizen','moderator','admin')),
  is_verified boolean not null default false, -- e.g. verified via NIN, for trust badges
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Profiles are publicly readable"
  on profiles for select
  using (true);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from profiles where id = auth.uid()));

-- ── Forum: posts & comments ─────────────────────────────────────
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  topic text,                -- e.g. 'national', 'lagos-state', 'economy'
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  score integer not null default 0,          -- denormalized vote total, maintained by trigger
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  search_vector tsvector generated always as
    (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) stored
);
create index idx_posts_topic on posts(topic);
create index idx_posts_created on posts(created_at desc);
create index idx_posts_author on posts(author_id);
create index idx_posts_status on posts(status);
create index idx_posts_search on posts using gin(search_vector);

alter table posts enable row level security;

create policy "Visible posts are publicly readable"
  on posts for select
  using (status = 'visible' or author_id = auth.uid() or exists (
    select 1 from profiles where id = auth.uid() and role in ('moderator','admin')
  ));

create policy "Authenticated users can create posts"
  on posts for insert
  with check (auth.uid() = author_id);

create policy "Authors can edit their own visible posts"
  on posts for update
  using (auth.uid() = author_id and status = 'visible')
  with check (auth.uid() = author_id);

create policy "Moderators can change post status"
  on posts for update
  using (exists (
    select 1 from profiles where id = auth.uid() and role in ('moderator','admin')
  ));

-- Preserves the original text of a post whenever it's edited, so a claim
-- can't be silently rewritten after other citizens have reacted to it.
create table post_edits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  previous_title text not null,
  previous_body text not null,
  edited_at timestamptz not null default now()
);

alter table post_edits enable row level security;

create policy "Post edit history is publicly readable"
  on post_edits for select
  using (true);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  parent_comment_id uuid references comments(id) on delete cascade, -- for threading
  body text not null,
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  score integer not null default 0,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_comments_post on comments(post_id);
create index idx_comments_parent on comments(parent_comment_id);
create index idx_comments_author on comments(author_id);

alter table comments enable row level security;

create policy "Visible comments are publicly readable"
  on comments for select
  using (status = 'visible' or author_id = auth.uid() or exists (
    select 1 from profiles where id = auth.uid() and role in ('moderator','admin')
  ));

create policy "Authenticated users can comment"
  on comments for insert
  with check (auth.uid() = author_id);

create policy "Authors can edit their own visible comments"
  on comments for update
  using (auth.uid() = author_id and status = 'visible')
  with check (auth.uid() = author_id);

create policy "Moderators can change comment status"
  on comments for update
  using (exists (
    select 1 from profiles where id = auth.uid() and role in ('moderator','admin')
  ));

create table comment_edits (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  previous_body text not null,
  edited_at timestamptz not null default now()
);

alter table comment_edits enable row level security;

create policy "Comment edit history is publicly readable"
  on comment_edits for select
  using (true);

-- ── Votes ────────────────────────────────────────────────────────
create table votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  constraint votes_target_check check (num_nonnulls(post_id, comment_id) = 1)
);
-- Partial unique indexes: a plain unique(user_id, post_id, comment_id) doesn't work
-- here because NULL <> NULL in Postgres, so it would never block duplicate votes.
create unique index votes_user_post_uniq on votes(user_id, post_id) where comment_id is null;
create unique index votes_user_comment_uniq on votes(user_id, comment_id) where post_id is null;
create index idx_votes_post on votes(post_id);
create index idx_votes_comment on votes(comment_id);

alter table votes enable row level security;

create policy "Votes are publicly readable"
  on votes for select
  using (true);

create policy "Users can cast their own votes"
  on votes for insert
  with check (auth.uid() = user_id);

create policy "Users can change their own votes"
  on votes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove their own votes"
  on votes for delete
  using (auth.uid() = user_id);

-- Keeps posts.score / comments.score in sync so list views don't need to
-- aggregate the votes table on every read.
create or replace function apply_vote_delta(p_post_id uuid, p_comment_id uuid, p_delta int)
returns void language plpgsql as $$
begin
  if p_post_id is not null then
    update posts set score = score + p_delta where id = p_post_id;
  else
    update comments set score = score + p_delta where id = p_comment_id;
  end if;
end;
$$;

create or replace function votes_after_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform apply_vote_delta(new.post_id, new.comment_id, new.value);
  elsif tg_op = 'UPDATE' then
    perform apply_vote_delta(new.post_id, new.comment_id, new.value - old.value);
  elsif tg_op = 'DELETE' then
    perform apply_vote_delta(old.post_id, old.comment_id, -old.value);
  end if;
  return null;
end;
$$;

create trigger trg_votes_after_change
  after insert or update or delete on votes
  for each row execute function votes_after_change();

-- Snapshots the pre-edit text of a post/comment before it's overwritten,
-- so post_edits/comment_edits stay populated without extra app-side calls.
create or replace function capture_post_edit() returns trigger language plpgsql as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    insert into post_edits (post_id, previous_title, previous_body)
      values (old.id, old.title, old.body);
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_posts_capture_edit
  before update on posts
  for each row execute function capture_post_edit();

create or replace function capture_comment_edit() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body then
    insert into comment_edits (comment_id, previous_body) values (old.id, old.body);
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_comments_capture_edit
  before update on comments
  for each row execute function capture_comment_edit();

-- ── Moderation & reports (build this in from day one) ────────────
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  post_id uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  reason text not null,             -- 'misinformation','harassment','defamation','spam',...
  status text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  resolution_note text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_target_check check (num_nonnulls(post_id, comment_id) = 1)
);
create index idx_reports_status on reports(status);

alter table reports enable row level security;

create policy "Reporters can see their own reports"
  on reports for select
  using (auth.uid() = reporter_id or exists (
    select 1 from profiles where id = auth.uid() and role in ('moderator','admin')
  ));

create policy "Authenticated users can file reports"
  on reports for insert
  with check (auth.uid() = reporter_id);

create policy "Moderators can update reports"
  on reports for update
  using (exists (
    select 1 from profiles where id = auth.uid() and role in ('moderator','admin')
  ));

-- ── Government project tracker (populated via import pipeline) ───
create table projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  ministry text,             -- 'Ministry of Works', etc.
  state text,
  lga text,
  source text not null,       -- e.g. 'Open Treasury Portal', 'BudgIT'
  source_ref text,            -- external ID/URL for traceability
  budgeted_amount numeric,
  disbursed_amount numeric,   -- what was actually spent, per source — the budget/spend gap is the point
  currency text not null default 'NGN',
  status text default 'unknown' check (status in ('planned','ongoing','completed','stalled','unknown')),
  description text,
  imported_at timestamptz not null default now(),
  unique (source, source_ref)
);
create index idx_projects_state on projects(state);
create index idx_projects_ministry on projects(ministry);

alter table projects enable row level security;

create policy "Projects are publicly readable"
  on projects for select
  using (true);

create policy "Admins manage projects"
  on projects for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- User-submitted status updates/evidence on a tracked project
-- (mark clearly as unverified user claims, distinct from official `projects` data)
create table project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  submitted_by uuid not null references profiles(id),
  note text not null,
  photo_url text,
  latitude numeric,
  longitude numeric,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_project_updates_project on project_updates(project_id);

alter table project_updates enable row level security;

create policy "Project updates are publicly readable"
  on project_updates for select
  using (true);

create policy "Authenticated users can submit project updates"
  on project_updates for insert
  with check (auth.uid() = submitted_by);

-- Let users follow projects/topics for notifications
create table follows (
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  topic text,
  created_at timestamptz not null default now(),
  constraint follows_target_check check (num_nonnulls(project_id, topic) = 1)
);
-- A composite primary key can't contain an expression like coalesce(...), so
-- the "exactly one of project_id/topic, no duplicates" rule needs a unique
-- index instead.
create unique index follows_uniq on follows(user_id, coalesce(project_id::text, topic));

alter table follows enable row level security;

create policy "Users manage their own follows"
  on follows for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Extension points (build later, don't scaffold yet) ────────────
-- ai_chat_sessions / ai_chat_messages  — civic education chatbot history
-- fact_checks                          — cached results from fact-check APIs
-- bills / bill_follows                 — legislative tracking (v2)
-- election_reports                     — crowdsourced monitoring (v2, needs its own
--                                         verification workflow — do not reuse `reports`)
