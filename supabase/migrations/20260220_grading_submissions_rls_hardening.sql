-- Ensure grading submissions tables always enforce per-user access.
-- Safe to run repeatedly.

ALTER TABLE IF EXISTS public.grading_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.grading_submission_items ENABLE ROW LEVEL SECURITY;
-- Restrict base table privileges to authenticated users only.
REVOKE ALL ON TABLE public.grading_submissions FROM anon;
REVOKE ALL ON TABLE public.grading_submission_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grading_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grading_submission_items TO authenticated;
DROP POLICY IF EXISTS "Users can view own grading submissions" ON public.grading_submissions;
CREATE POLICY "Users can view own grading submissions"
  ON public.grading_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own grading submissions" ON public.grading_submissions;
CREATE POLICY "Users can create own grading submissions"
  ON public.grading_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own grading submissions" ON public.grading_submissions;
CREATE POLICY "Users can update own grading submissions"
  ON public.grading_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own grading submissions" ON public.grading_submissions;
CREATE POLICY "Users can delete own grading submissions"
  ON public.grading_submissions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own grading submission items" ON public.grading_submission_items;
CREATE POLICY "Users can view own grading submission items"
  ON public.grading_submission_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own grading submission items" ON public.grading_submission_items;
CREATE POLICY "Users can create own grading submission items"
  ON public.grading_submission_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own grading submission items" ON public.grading_submission_items;
CREATE POLICY "Users can update own grading submission items"
  ON public.grading_submission_items FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own grading submission items" ON public.grading_submission_items;
CREATE POLICY "Users can delete own grading submission items"
  ON public.grading_submission_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
