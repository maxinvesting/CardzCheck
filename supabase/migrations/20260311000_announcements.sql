-- Announcements table: CardzCheck internal news + platform updates
-- Visible to: all users (public=true) or business-only (public=false)

CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general'
                CHECK (category IN ('general', 'platform', 'grading', 'market', 'business')),
  is_public   BOOLEAN NOT NULL DEFAULT true,    -- false = business-tier only
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Everyone can read public announcements
CREATE POLICY "announcements_read_public"
  ON announcements FOR SELECT
  USING (is_public = true AND published_at <= NOW());

-- Service role reads all (including business-only)
CREATE POLICY "announcements_service_all"
  ON announcements FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed: welcome announcement
INSERT INTO announcements (title, body, category, is_public, is_pinned) VALUES
(
  'Welcome to the CardzCheck News Feed',
  'Stay up to date with sports card market trends, grading company updates, and platform announcements — all in one place.',
  'platform',
  true,
  true
),
(
  'GradeScan Engine 2.0 — Now Available',
  'Multi-card batch scanning is live for Business plan members. Analyze up to 3 cards simultaneously with per-slot AI grade probability reports.',
  'platform',
  false,
  true
);
