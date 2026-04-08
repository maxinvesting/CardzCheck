-- Migration: Indexes for CardPicker structured search
-- Date: 2026-02-03

CREATE INDEX IF NOT EXISTS cards_player_set_idx
  ON public.cards (player_name, set_name);

CREATE INDEX IF NOT EXISTS cards_player_set_year_idx
  ON public.cards (player_name, set_name, year);
