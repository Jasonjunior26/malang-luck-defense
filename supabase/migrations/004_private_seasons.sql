-- 말랑 운빨 디펜스: 프라이빗 시즌 (지인끼리 규칙을 정해 여는 시즌). 002, 003 다음에 Supabase SQL Editor 에서 Run. 여러 번 실행해도 안전.
-- 기존 테이블/뷰는 바꾸지 않는다(leaderboard_* 뷰는 mode='daily' 만 보므로 mode='private' 행은 노출되지 않음). 모든 RPC 는 service_role 전용(submit-score 함수가 호출).
-- player_id = auth.users.id (JWT sub). 날짜는 모두 KST 날짜(p_today) 를 함수가 넘겨준다(테스트 가능하게).

-- ───────────────────────── 테이블 ─────────────────────────
create table if not exists public.private_seasons (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid        not null,
  name            text        not null check (char_length(name) between 2 and 20),
  start_date      date        not null,
  end_date        date        not null,
  rules           jsonb       not null,
  rules_hash      text        not null,
  invite_code     text        not null unique check (invite_code ~ '^[A-Za-z0-9]{8}$'),
  max_players     int         not null default 10 check (max_players between 2 and 30),
  daily_run_limit int         check (daily_run_limit is null or daily_run_limit in (3, 5, 10)),
  status          text        not null default 'active' check (status in ('active', 'cancelled')),
  ended_at        timestamptz,                               -- 시작 후 호스트가 조기 종료한 시각 (null = 정상 진행)
  created_at      timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 59)  -- 기간 최대 60일(양끝 포함)
);
create index if not exists private_seasons_owner_idx on public.private_seasons (owner);

create table if not exists public.season_members (
  season_id  uuid        not null references public.private_seasons (id) on delete cascade,
  player_id  uuid        not null,
  name       text        not null,                           -- 참가 시점 닉네임 스냅샷 (제출 때 갱신)
  kicked     boolean     not null default false,             -- 내보냄: 순위 제외 + 재입장 차단
  joined_at  timestamptz not null default now(),
  unique (season_id, player_id)
);
create index if not exists season_members_player_idx on public.season_members (player_id);

alter table public.private_seasons enable row level security;
alter table public.season_members enable row level security;
revoke all on public.private_seasons, public.season_members from anon, authenticated;

-- scores: 프라이빗 시즌 기록. mode='private', device_id 칸에는 player_id 를 넣는다(unique (device_id,mode,seed) 가 같은 판 중복 제출을 막음).
alter table public.scores add column if not exists season_id uuid;
create index if not exists scores_season_id_idx on public.scores (season_id, device_id, score desc) where season_id is not null;
-- 기존 check 는 mode in (daily,practice), round<=50, score<=30000 이라 프라이빗(최대 200라운드)을 막는다 -> 완화.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.scores'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) like '%mode%' or pg_get_constraintdef(oid) like '%round%' or pg_get_constraintdef(oid) like '%score%')
  loop execute format('alter table public.scores drop constraint %I', c.conname); end loop;
end $$;
alter table public.scores add constraint scores_mode_check  check (mode in ('daily', 'practice', 'private'));
alter table public.scores add constraint scores_round_check check (round between 1 and 200);
alter table public.scores add constraint scores_score_check check (score between 0 and 1000000);

-- ───────────────────────── 내부 헬퍼 ─────────────────────────
-- 시즌 JSON (공개 가능한 필드)
create or replace function public.ps_json(s public.private_seasons, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'start', s.start_date, 'end', s.end_date, 'rules', s.rules, 'rules_hash', s.rules_hash,
    'max_players', s.max_players, 'daily_run_limit', s.daily_run_limit, 'status', s.status, 'ended', s.ended_at is not null,
    'is_owner', s.owner = p_user,
    'invite_code', case when s.owner = p_user then s.invite_code else null end,
    'member_count', (select count(*) from public.season_members m where m.season_id = s.id and not m.kicked),
    'is_member', exists (select 1 from public.season_members m where m.season_id = s.id and m.player_id = p_user and not m.kicked)
  );
$$;

-- 진행 중(참가 한도에 포함)인 시즌: 취소 아님 + 조기 종료 아님 + 종료일 미경과
create or replace function public.ps_live(s public.private_seasons, p_today date)
returns boolean language sql immutable as $$
  select s.status = 'active' and s.ended_at is null and s.end_date >= p_today;
$$;

create or replace function public.ps_code()
returns text language plpgsql volatile as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r text; i int;
begin
  loop
    r := '';
    for i in 1..8 loop r := r || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.private_seasons where invite_code = r);
  end loop;
  return r;
end $$;

-- 계정이 현재 참가 중인 시즌 수 / 호스트 중인 시즌 수
create or replace function public.ps_counts(p_user uuid, p_today date, out joined int, out hosted int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from public.season_members m join public.private_seasons s on s.id = m.season_id
           where m.player_id = p_user and not m.kicked and public.ps_live(s, p_today)),
         (select count(*)::int from public.private_seasons s where s.owner = p_user and public.ps_live(s, p_today));
$$;

-- ───────────────────────── RPC ─────────────────────────
-- 닉네임 조회: 003_accounts.sql 이 만든 players.user_id(카카오 연결) 기준. 연결 전이면 null -> 함수가 no_player(409) 로 응답.
create or replace function public.ps_display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select name from public.players where user_id = p_user limit 1;
$$;

create or replace function public.private_season_create(
  p_owner uuid, p_name text, p_start date, p_end date, p_rules jsonb, p_hash text,
  p_max int, p_daily int, p_owner_name text, p_today date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; s public.private_seasons;
begin
  select * into c from public.ps_counts(p_owner, p_today);
  if c.hosted >= 2 then return jsonb_build_object('status', 'host_limit'); end if;
  if c.joined >= 3 then return jsonb_build_object('status', 'join_limit'); end if;
  insert into public.private_seasons (owner, name, start_date, end_date, rules, rules_hash, invite_code, max_players, daily_run_limit)
  values (p_owner, p_name, p_start, p_end, p_rules, p_hash, public.ps_code(), p_max, p_daily) returning * into s;
  insert into public.season_members (season_id, player_id, name) values (s.id, p_owner, p_owner_name);
  return jsonb_build_object('status', 'ok', 'season', public.ps_json(s, p_owner));
end $$;

create or replace function public.private_season_join(p_user uuid, p_code text, p_name text, p_today date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.private_seasons; m public.season_members; c record; n int;
begin
  select * into s from public.private_seasons where invite_code = upper(p_code) for update;   -- 정원 경쟁 직렬화
  if not found then return jsonb_build_object('status', 'no_such_season'); end if;
  if s.status = 'cancelled' then return jsonb_build_object('status', 'cancelled'); end if;
  if s.ended_at is not null or s.end_date < p_today then return jsonb_build_object('status', 'season_over', 'season', public.ps_json(s, p_user)); end if;
  select * into m from public.season_members where season_id = s.id and player_id = p_user;
  if found and m.kicked then return jsonb_build_object('status', 'kicked'); end if;
  if found then return jsonb_build_object('status', 'already', 'season', public.ps_json(s, p_user)); end if;
  select count(*) into n from public.season_members where season_id = s.id and not kicked;
  if n >= s.max_players then return jsonb_build_object('status', 'full'); end if;
  select * into c from public.ps_counts(p_user, p_today);
  if c.joined >= 3 then return jsonb_build_object('status', 'join_limit'); end if;
  insert into public.season_members (season_id, player_id, name) values (s.id, p_user, p_name);
  return jsonb_build_object('status', 'ok', 'season', public.ps_json(s, p_user));
end $$;

-- id 또는 초대 코드로 조회(초대 미리보기 허용). 오늘 이 계정의 제출 판수(runs_today)도 함께.
create or replace function public.private_season_get(p_user uuid, p_id uuid default null, p_code text default null, p_today date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.private_seasons; j jsonb; used int := 0;
begin
  select * into s from public.private_seasons where (p_id is not null and id = p_id) or (p_id is null and invite_code = upper(p_code));
  if not found then return jsonb_build_object('status', 'no_such_season'); end if;
  j := public.ps_json(s, p_user);
  if p_today is not null then
    select count(*) into used from public.scores x
     where x.season_id = s.id and x.device_id = p_user and (x.played_at at time zone 'Asia/Seoul')::date = p_today;
  end if;
  return jsonb_build_object('status', 'ok', 'season', j || jsonb_build_object('runs_today', used,
    'kicked', exists (select 1 from public.season_members m where m.season_id = s.id and m.player_id = p_user and m.kicked)));
end $$;

create or replace function public.private_season_list_mine(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.ps_json(s, p_user) order by s.start_date desc, s.created_at desc), '[]'::jsonb)
  from public.private_seasons s join public.season_members m on m.season_id = s.id
  where m.player_id = p_user and not m.kicked;
$$;

-- 순위: 멤버만 열람. 시즌 내 최고점 1건, 동점은 도달 라운드(높은 쪽) -> 먼저 달성한 시각. 내보낸 멤버 제외.
create or replace function public.private_season_leaderboard(p_user uuid, p_id uuid, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rows jsonb;
begin
  if not exists (select 1 from public.season_members where season_id = p_id and player_id = p_user and not kicked) then
    return jsonb_build_object('status', 'not_member');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('rank', t.rank, 'name', t.name, 'score', t.score, 'round', t.round, 'win', t.win,
                                               'hero', t.hero, 'played_at', t.played_at, 'me', t.player_id = p_user,
                                               'owner', t.player_id = (select owner from public.private_seasons where id = p_id)) order by t.rank), '[]'::jsonb)
    into rows
  from (
    select b.*, row_number() over (order by b.score desc, b.round desc, b.played_at asc, b.player_id) as rank
    from (
      select distinct on (m.player_id) m.player_id, m.name, x.score, x.round, x.win, x.hero, x.played_at
      from public.season_members m join public.scores x on x.season_id = m.season_id and x.device_id = m.player_id
      where m.season_id = p_id and not m.kicked
      order by m.player_id, x.score desc, x.round desc, x.played_at asc
    ) b
  ) t where t.rank <= p_limit;
  return jsonb_build_object('status', 'ok', 'rows', rows,
    'total', (select count(distinct x.device_id) from public.scores x join public.season_members m on m.season_id = x.season_id and m.player_id = x.device_id and not m.kicked where x.season_id = p_id));
end $$;

create or replace function public.private_season_kick(p_owner uuid, p_id uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.private_seasons;
begin
  select * into s from public.private_seasons where id = p_id for update;
  if not found then return jsonb_build_object('status', 'no_such_season'); end if;
  if s.owner <> p_owner then return jsonb_build_object('status', 'not_owner'); end if;
  if p_target = p_owner then return jsonb_build_object('status', 'cannot_kick_self'); end if;
  update public.season_members set kicked = true where season_id = p_id and player_id = p_target and not kicked;
  if not found then return jsonb_build_object('status', 'no_such_member'); end if;
  return jsonb_build_object('status', 'ok');
end $$;

-- 취소: 시작 전 = 취소(status=cancelled). 시작 후 = 조기 종료(ended_at 기록, 순위는 영구 열람). 이미 끝났거나 취소된 시즌은 'already'.
create or replace function public.private_season_cancel(p_owner uuid, p_id uuid, p_today date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.private_seasons;
begin
  select * into s from public.private_seasons where id = p_id for update;
  if not found then return jsonb_build_object('status', 'no_such_season'); end if;
  if s.owner <> p_owner then return jsonb_build_object('status', 'not_owner'); end if;
  if s.status = 'cancelled' or s.ended_at is not null or s.end_date < p_today then return jsonb_build_object('status', 'already'); end if;
  if p_today < s.start_date then
    update public.private_seasons set status = 'cancelled' where id = p_id;
    return jsonb_build_object('status', 'ok', 'result', 'cancelled');
  end if;
  update public.private_seasons set ended_at = now() where id = p_id;
  return jsonb_build_object('status', 'ok', 'result', 'ended');
end $$;

-- 호스트 탈퇴 처리(계정 삭제 흐름에서 호출): 진행/대기 시즌의 호스트를 가장 먼저 참가한 다른 멤버에게 위임, 멤버가 없으면 취소/종료.
create or replace function public.private_season_owner_left(p_user uuid, p_today date)
returns int language plpgsql security definer set search_path = public as $$
declare s public.private_seasons; nxt uuid; k int := 0;
begin
  for s in select * from public.private_seasons x where x.owner = p_user and x.status = 'active' and x.ended_at is null and x.end_date >= p_today for update loop
    select player_id into nxt from public.season_members where season_id = s.id and player_id <> p_user and not kicked order by joined_at limit 1;
    if nxt is not null then
      update public.private_seasons set owner = nxt where id = s.id;
    elsif p_today < s.start_date then
      update public.private_seasons set status = 'cancelled' where id = s.id;
    else
      update public.private_seasons set ended_at = now() where id = s.id;
    end if;
    update public.season_members set kicked = true where season_id = s.id and player_id = p_user;  -- 탈퇴 계정의 기록은 순위에서 제외
    k := k + 1;
  end loop;
  return k;
end $$;

-- 검증 통과한 점수 저장. 기간(종료 +10분 유예)·멤버십·일일 판수·중복(같은 seed)을 DB 에서 다시 확인한다.
create or replace function public.submit_score_private(
  p_user uuid, p_season uuid, p_name text, p_score int, p_round int, p_win boolean, p_seed int,
  p_hero text, p_units jsonb, p_ver text, p_inputs_hash text, p_today date, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.private_seasons; m public.season_members; used int; rb int; ra int; sb int; pb int; tot int; n int;
begin
  select * into s from public.private_seasons where id = p_season;
  if not found then return jsonb_build_object('status', 'no_such_season'); end if;
  select * into m from public.season_members where season_id = p_season and player_id = p_user for update;  -- 같은 유저의 동시 제출 직렬화
  if not found or m.kicked then return jsonb_build_object('status', 'not_member'); end if;
  if s.status = 'cancelled' then return jsonb_build_object('status', 'cancelled'); end if;
  if p_today < s.start_date then return jsonb_build_object('status', 'not_started'); end if;
  if s.ended_at is not null or p_now > ((s.end_date + 1)::timestamp at time zone 'Asia/Seoul') + interval '10 minutes' then
    return jsonb_build_object('status', 'season_over');
  end if;
  if s.daily_run_limit is not null then
    select count(*) into used from public.scores x
     where x.season_id = p_season and x.device_id = p_user and (x.played_at at time zone 'Asia/Seoul')::date = p_today;
    if used >= s.daily_run_limit then return jsonb_build_object('status', 'daily_limit', 'limit', s.daily_run_limit); end if;
  end if;
  select r.rank::int, r.score into rb, pb from (
    select b.player_id, b.score, row_number() over (order by b.score desc, b.round desc, b.played_at asc, b.player_id) as rank
    from (select distinct on (x.device_id) x.device_id as player_id, x.score, x.round, x.played_at
          from public.scores x join public.season_members mm on mm.season_id = x.season_id and mm.player_id = x.device_id and not mm.kicked
          where x.season_id = p_season order by x.device_id, x.score desc, x.round desc, x.played_at asc) b) r where r.player_id = p_user;

  insert into public.scores (name, score, round, win, mode, seed, hero, units, ver, inputs_hash, device_id, season_id)
  values (p_name, p_score, p_round, p_win, 'private', p_seed, p_hero, coalesce(p_units, '{}'::jsonb), p_ver, p_inputs_hash, p_user, p_season)
  on conflict (device_id, mode, seed) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('status', 'duplicate'); end if;
  update public.season_members set name = p_name where season_id = p_season and player_id = p_user;

  select r.rank::int, r.score into ra, sb from (
    select b.player_id, b.score, row_number() over (order by b.score desc, b.round desc, b.played_at asc, b.player_id) as rank
    from (select distinct on (x.device_id) x.device_id as player_id, x.score, x.round, x.played_at
          from public.scores x join public.season_members mm on mm.season_id = x.season_id and mm.player_id = x.device_id and not mm.kicked
          where x.season_id = p_season order by x.device_id, x.score desc, x.round desc, x.played_at asc) b) r where r.player_id = p_user;
  select count(distinct x.device_id)::int into tot from public.scores x join public.season_members mm on mm.season_id = x.season_id and mm.player_id = x.device_id and not mm.kicked where x.season_id = p_season;
  return jsonb_build_object('status', 'ok', 'saved', true, 'season_best', sb, 'prev_best', pb, 'rank_before', rb, 'rank_after', ra, 'total', tot);
end $$;

-- ───────────────────────── 권한: service_role 전용 ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'ps_json(public.private_seasons, uuid)', 'ps_live(public.private_seasons, date)', 'ps_code()', 'ps_counts(uuid, date)', 'ps_display_name(uuid)',
    'private_season_create(uuid, text, date, date, jsonb, text, int, int, text, date)',
    'private_season_join(uuid, text, text, date)', 'private_season_get(uuid, uuid, text, date)', 'private_season_list_mine(uuid)',
    'private_season_leaderboard(uuid, uuid, int)', 'private_season_kick(uuid, uuid, uuid)', 'private_season_cancel(uuid, uuid, date)',
    'private_season_owner_left(uuid, date)',
    'submit_score_private(uuid, uuid, text, int, int, boolean, int, text, jsonb, text, text, date, timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
