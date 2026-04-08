ALTER TABLE public.business_accounts
  ADD COLUMN IF NOT EXISTS appearance_primary_color text NOT NULL DEFAULT '#1D9E75',
  ADD COLUMN IF NOT EXISTS appearance_secondary_color text NOT NULL DEFAULT '#15803D',
  ADD COLUMN IF NOT EXISTS appearance_tertiary_color text NOT NULL DEFAULT '#0F766E';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_accounts_appearance_primary_color_check'
  ) THEN
    ALTER TABLE public.business_accounts
      ADD CONSTRAINT business_accounts_appearance_primary_color_check
      CHECK (appearance_primary_color ~ '^#[0-9A-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_accounts_appearance_secondary_color_check'
  ) THEN
    ALTER TABLE public.business_accounts
      ADD CONSTRAINT business_accounts_appearance_secondary_color_check
      CHECK (appearance_secondary_color ~ '^#[0-9A-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_accounts_appearance_tertiary_color_check'
  ) THEN
    ALTER TABLE public.business_accounts
      ADD CONSTRAINT business_accounts_appearance_tertiary_color_check
      CHECK (appearance_tertiary_color ~ '^#[0-9A-F]{6}$');
  END IF;
END $$;

UPDATE public.business_accounts
SET
  appearance_primary_color = UPPER(appearance_primary_color),
  appearance_secondary_color = UPPER(appearance_secondary_color),
  appearance_tertiary_color = UPPER(appearance_tertiary_color);
