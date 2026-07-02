-- Draw & Order — Phase 1: storage buckets. BOTH PRIVATE.
--
--   * suspect-images: only the service role reads. Clients get a short-lived
--     signed URL at reveal, minted by a server route that also marks the
--     round revealed. No storage policies on purpose.
--   * drawings: users read their own via RLS-scoped paths ({user_id}/...).
--     Uploads happen through server routes (service role) after validation.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('suspect-images', 'suspect-images', false, 4194304, array['image/png']),
  ('drawings', 'drawings', false, 2097152, array['image/png'])
on conflict (id) do nothing;

-- drawings: owners may read their own files. Path convention: the first
-- folder segment is the owner's auth.uid().
create policy "drawings_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );