-- Adds a flyer image URL column to events (populated via Cloudinary upload).

alter table public.events
  add column if not exists flyer_url text;
