-- Database RPC for deleting own user account with shared trip protection.
-- This migration runs as postgres (superuser) to bypass RLS and delete from auth.users.
--
-- Rollback:
--   drop function if exists public.delete_own_user_account();

create or replace function public.delete_own_user_account()
returns void as $$
declare
  current_user_id uuid;
  t_record record;
  successor_id uuid;
begin
  -- 1. 取得當前認證的 user ID
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 2. 遍歷當前用戶所擁有的所有 trips
  for t_record in 
    select id from public.trips where owner_id = current_user_id
  loop
    -- 3. 檢查此 trip 是否有其他 active 成員，並挑選繼任者
    select user_id into successor_id
    from public.trip_members
    where trip_id = t_record.id
      and user_id != current_user_id
      and status = 'active'
    order by
      case role
        when 'admin' then 1
        when 'editor' then 2
        when 'viewer' then 3
        else 4
      end asc,
      created_at asc
    limit 1;

    if successor_id is not null then
      -- Shared Trip: 轉移所有權以保留資料
      update public.trips 
      set owner_id = successor_id,
          updated_at = now()
      where id = t_record.id;

      -- 將繼任者嘅角色變更為 owner
      update public.trip_members
      set role = 'owner',
          updated_at = now()
      where trip_id = t_record.id and user_id = successor_id;

      -- 轉移 receipts 擁有權（避免 cascade delete 掉）
      update public.receipts
      set owner_id = successor_id,
          updated_at = now()
      where trip_id = t_record.id and owner_id = current_user_id;

      -- 轉移 receipt_items 擁有權
      update public.receipt_items
      set owner_id = successor_id,
          updated_at = now()
      where receipt_id in (select id from public.receipts where trip_id = t_record.id)
        and owner_id = current_user_id;

      -- 轉移 receipt_photos 擁有權
      update public.receipt_photos
      set owner_id = successor_id,
          updated_at = now()
      where receipt_id in (select id from public.receipts where trip_id = t_record.id)
        and owner_id = current_user_id;

      -- 轉移 Notion backend 綁定擁有者
      update public.trip_backend_links
      set notion_owner_user_id = successor_id,
          created_by = successor_id,
          updated_at = now()
      where trip_id = t_record.id;

      -- 轉移 trip_invites 的邀請者
      update public.trip_invites
      set invited_by = successor_id,
          updated_at = now()
      where trip_id = t_record.id and invited_by = current_user_id;
    end if;
  end loop;

  -- 4. 清理唯一一個非 cascade 嘅 FK：private.notion_import_batches.target_owner_id
  --    呢條 FK 係 ON DELETE RESTRICT，如果用戶有 import 紀錄，下面 delete auth.users 會 raise
  --    foreign_key_violation，導致整個註銷 RPC 失敗。先手動清走。
  delete from private.notion_import_batches where target_owner_id = current_user_id;

  -- 5. 物理刪除 auth.users 帳戶 (依賴 on delete cascade 自動清理 private profiles/trips/receipts)
  delete from auth.users where id = current_user_id;
end;
$$ language plpgsql security definer;

alter function public.delete_own_user_account() owner to postgres;
