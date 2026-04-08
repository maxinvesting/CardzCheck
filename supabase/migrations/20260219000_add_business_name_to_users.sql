-- Add optional business workspace name for personalized Business header.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS business_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_business_name_length_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_business_name_length_check
      CHECK (business_name IS NULL OR char_length(business_name) <= 120);
  END IF;
END $$;
