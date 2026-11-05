-- Run once in the database's SQL editor. The tracker writes here and the site reads from here, both on the server.
create table if not exists price_snapshots (
  id bigint generated always as identity primary key,
  contract text not null,
  t timestamptz not null default now(),
  tick integer not null,
  d jsonb not null
);
create index if not exists price_snapshots_contract_t on price_snapshots (contract, t);
alter table price_snapshots enable row level security; -- no public access: the server key bypasses this
