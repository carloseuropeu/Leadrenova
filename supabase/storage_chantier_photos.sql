-- Criar o bucket chantier-photos (executar no Supabase SQL Editor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chantier-photos',
  'chantier-photos',
  true,
  10485760, -- 10 MB por ficheiro
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS para storage.objects
-- O caminho esperado é: {user_id}/{lead_id}/{timestamp}-{filename}

CREATE POLICY "chantier_photos_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chantier-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "chantier_photos_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chantier-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "chantier_photos_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chantier-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
