-- Supabase Migration: Reassign Boss Data
-- Description: Move trips, receipts, receipt_items, receipt_photos from ftjdfr@gmail.com to vc06456@gmail.com

-- Source: ftjdfr@gmail.com
-- UUID: bf464ddb-9c80-4ae1-970c-1774d689d5fd

-- Target: vc06456@gmail.com
-- UUID: e6bd6e0a-4022-4491-95d3-e4b53ddc88f6

DO $$
DECLARE
    v_source_id UUID := 'bf464ddb-9c80-4ae1-970c-1774d689d5fd'::UUID;
    v_target_id UUID := 'e6bd6e0a-4022-4491-95d3-e4b53ddc88f6'::UUID;
BEGIN
    -- Only reassign if the target user actually exists to avoid foreign key violations
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_target_id) THEN
        
        -- 1. Update Trips
        UPDATE public.trips
        SET owner_id = v_target_id
        WHERE owner_id = v_source_id;

        -- 2. Update Trip Members (if any)
        UPDATE public.trip_members
        SET user_id = v_target_id
        WHERE user_id = v_source_id;
        
        -- 3. Update Receipts
        UPDATE public.receipts
        SET owner_id = v_target_id
        WHERE owner_id = v_source_id;

        -- 4. Update Receipt Items
        UPDATE public.receipt_items
        SET owner_id = v_target_id
        WHERE owner_id = v_source_id;

        -- 5. Update Receipt Photos
        UPDATE public.receipt_photos
        SET owner_id = v_target_id
        WHERE owner_id = v_source_id;

        -- 6. Update Integrations (Notion connections)
        UPDATE public.integrations
        SET user_id = v_target_id
        WHERE user_id = v_source_id;

    END IF;
END $$;
