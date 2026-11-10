-- "one custom option each" must not rely on timing: mark options that members add after the plan exists.
alter table public.plan_poll_options add column member_added boolean not null default false;

create or replace function public.add_poll_option(p_plan uuid, p_label text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  lbl text := btrim(coalesce(p_label, ''));
  new_id uuid;
begin
  if not public.is_plan_member(p_plan) then raise exception 'not_in_plan' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where id = p_plan and status = 'active') then
    raise exception 'plan_cancelled' using errcode = '22023';
  end if;
  if char_length(lbl) < 1 or char_length(lbl) > 30 then raise exception 'bad_label' using errcode = '22023'; end if;
  if (select count(*) from public.plan_poll_options where plan_id = p_plan) >= 8 then
    raise exception 'too_many_options' using errcode = '22023';
  end if;
  if exists (select 1 from public.plan_poll_options where plan_id = p_plan and member_added and added_by = auth.uid()) then
    raise exception 'one_option_each' using errcode = '22023';
  end if;
  insert into public.plan_poll_options (plan_id, label, is_custom, added_by, member_added)
  values (p_plan, lbl, true, auth.uid(), true)
  returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'duplicate_option' using errcode = '22023';
end;
$$;
