-- Migration: Create analyst_threads and analyst_messages tables for persistent chat history
-- Created: 2024-01-26

-- Create analyst_threads table
CREATE TABLE IF NOT EXISTS analyst_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create analyst_messages table
CREATE TABLE IF NOT EXISTS analyst_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES analyst_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_analyst_threads_user_updated ON analyst_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyst_messages_thread_created ON analyst_messages(thread_id, created_at ASC);

-- Create updated_at trigger function (use IF NOT EXISTS pattern)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for analyst_threads to auto-update updated_at
DROP TRIGGER IF EXISTS update_analyst_threads_updated_at ON analyst_threads;
CREATE TRIGGER update_analyst_threads_updated_at
  BEFORE UPDATE ON analyst_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE analyst_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analyst_threads
-- Users can only view their own threads
DROP POLICY IF EXISTS "Users can view own threads" ON analyst_threads;
CREATE POLICY "Users can view own threads"
  ON analyst_threads FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only create threads for themselves
DROP POLICY IF EXISTS "Users can create own threads" ON analyst_threads;
CREATE POLICY "Users can create own threads"
  ON analyst_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own threads
DROP POLICY IF EXISTS "Users can update own threads" ON analyst_threads;
CREATE POLICY "Users can update own threads"
  ON analyst_threads FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own threads
DROP POLICY IF EXISTS "Users can delete own threads" ON analyst_threads;
CREATE POLICY "Users can delete own threads"
  ON analyst_threads FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for analyst_messages
-- Users can only view messages in threads they own
DROP POLICY IF EXISTS "Users can view messages in own threads" ON analyst_messages;
CREATE POLICY "Users can view messages in own threads"
  ON analyst_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analyst_threads
      WHERE analyst_threads.id = analyst_messages.thread_id
      AND analyst_threads.user_id = auth.uid()
    )
  );

-- Users can only create messages in threads they own
DROP POLICY IF EXISTS "Users can create messages in own threads" ON analyst_messages;
CREATE POLICY "Users can create messages in own threads"
  ON analyst_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM analyst_threads
      WHERE analyst_threads.id = analyst_messages.thread_id
      AND analyst_threads.user_id = auth.uid()
    )
  );
