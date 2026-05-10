-- Migration: add street address columns to permis_construire
-- Run once in the Supabase SQL Editor.
-- These columns come from the SITADEL CSV fields adr_num_ter and adr_libvoie_ter.

ALTER TABLE public.permis_construire
  ADD COLUMN IF NOT EXISTS adr_num_ter     text,
  ADD COLUMN IF NOT EXISTS adr_libvoie_ter text;
