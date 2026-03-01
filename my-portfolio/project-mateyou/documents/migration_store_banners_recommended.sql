-- Store Banners Table
CREATE TABLE IF NOT EXISTS public.store_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner TEXT NOT NULL,
  sort_order INT4 NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store Recommended Partners Table
CREATE TABLE IF NOT EXISTS public.store_recommended (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  sort_order INT4 NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(partner_id)
);

-- RLS for store_banners
ALTER TABLE public.store_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read store_banners"
  ON public.store_banners FOR SELECT
  USING (true);

CREATE POLICY "Admin can insert store_banners"
  ON public.store_banners FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update store_banners"
  ON public.store_banners FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete store_banners"
  ON public.store_banners FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS for store_recommended
ALTER TABLE public.store_recommended ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read store_recommended"
  ON public.store_recommended FOR SELECT
  USING (true);

CREATE POLICY "Admin can insert store_recommended"
  ON public.store_recommended FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update store_recommended"
  ON public.store_recommended FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete store_recommended"
  ON public.store_recommended FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Index for sort_order
CREATE INDEX IF NOT EXISTS idx_store_banners_sort_order ON public.store_banners(sort_order);
CREATE INDEX IF NOT EXISTS idx_store_recommended_sort_order ON public.store_recommended(sort_order);

-- Storage Bucket for store_banners (run in Supabase dashboard or via API)
-- NOTE: Storage bucket 생성은 SQL로 직접 할 수 없으므로 Supabase Dashboard에서 수동으로 생성해야 합니다.
-- 1. Supabase Dashboard > Storage 메뉴
-- 2. "New bucket" 클릭
-- 3. 버킷 이름: store_banners
-- 4. Public bucket: 체크 (활성화)
-- 5. File size limit: 10MB (권장)
-- 6. Allowed MIME types: image/* (권장)

-- Storage Policy for store_banners bucket (Dashboard > Storage > Policies에서 생성)
-- 1. SELECT (read): true (누구나 읽기 가능)
-- 2. INSERT (upload): auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin')
-- 3. UPDATE: 동일한 조건
-- 4. DELETE: 동일한 조건
