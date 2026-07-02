-- Adds an image URL column to projects (populated via Cloudinary upload).

alter table public.projects
  add column if not exists image_url text;
