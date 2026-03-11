-- Fix: Allow new users to add licenses during signup
-- The issue is that auth.uid() is null immediately after signUp(),
-- so RLS policies block the insert.

-- Create a function that bypasses RLS to insert licenses
-- It validates that the closer_id matches an existing closer record
CREATE OR REPLACE FUNCTION insert_signup_licenses(
  p_closer_id UUID,
  p_state_codes TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
  v_closer_exists BOOLEAN;
BEGIN
  -- Verify the closer exists (security check)
  SELECT EXISTS(SELECT 1 FROM closers WHERE id = p_closer_id) INTO v_closer_exists;

  IF NOT v_closer_exists THEN
    RAISE EXCEPTION 'Closer does not exist';
  END IF;

  -- Insert licenses (ignoring duplicates)
  INSERT INTO closer_licenses (closer_id, state_code, verified)
  SELECT p_closer_id, unnest(p_state_codes), true
  ON CONFLICT (closer_id, state_code) DO NOTHING;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated and anon (needed during signup flow)
GRANT EXECUTE ON FUNCTION insert_signup_licenses TO authenticated;
GRANT EXECUTE ON FUNCTION insert_signup_licenses TO anon;
