
-- Milestone 1.4 — RLS on storage.objects for job-attachments bucket.
-- Path convention: {tenant_id}/{job_id}/{filename}
CREATE POLICY "job_attachments_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "job_attachments_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-attachments'
  AND public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "job_attachments_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND public.has_tenant_role((storage.foldername(name))[1]::uuid, VARIADIC ARRAY['owner','admin']::user_local_role[])
);
