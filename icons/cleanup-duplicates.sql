-- ═══════════════════════════════════════════════════════════════════════
-- PEAK — Clean Duplicate Array Values
-- ═══════════════════════════════════════════════════════════════════════
-- Removes case-insensitive duplicates from al/di/cu arrays.
-- Keeps the FIRST occurrence (usually the correctly-cased chip value).
--
-- Run this ONCE in Supabase SQL Editor.
-- Safe to re-run: only affects rows that still have duplicates.
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: dedupe a jsonb array case-insensitively, keeping first occurrence
CREATE OR REPLACE FUNCTION dedupe_jsonb_array(arr jsonb)
RETURNS jsonb AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  seen text[] := ARRAY[]::text[];
  item jsonb;
  item_lower text;
BEGIN
  IF arr IS NULL OR jsonb_typeof(arr) != 'array' THEN
    RETURN arr;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(arr)
  LOOP
    item_lower := lower(item #>> '{}');
    IF NOT (item_lower = ANY(seen)) THEN
      seen := array_append(seen, item_lower);
      result := result || jsonb_build_array(item);
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Apply dedup to all users (only rows where arrays exist)
UPDATE public.users
SET
  al = dedupe_jsonb_array(al),
  di = dedupe_jsonb_array(di),
  cu = dedupe_jsonb_array(cu),
  updated_at = now()
WHERE
  al IS NOT NULL OR
  di IS NOT NULL OR
  cu IS NOT NULL;

-- Clean up the helper function (optional — comment out if you want to keep it)
DROP FUNCTION IF EXISTS dedupe_jsonb_array(jsonb);

-- Verify: check your row
-- SELECT email, al, di, cu FROM public.users WHERE email = 'michael.mika.jahn@gmail.com';
