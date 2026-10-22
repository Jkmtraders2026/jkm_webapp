BEGIN;
CREATE TABLE public.staff_members
(user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_members
FROM anon,
  authenticated;
GRANT
SELECT ON public.staff_members TO authenticated;
CREATE policy "Staff can check own membership" ON public.staff_members
FOR
SELECT TO authenticated USING (user_id =
(SELECT auth.uid()));
CREATE TABLE public.website_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  company text NOT NULL DEFAULT '' CHECK (char_length(company)<=160),
  email text NOT NULL CHECK (char_length(email)<=200),
  phone text NOT NULL CHECK (char_length(phone) BETWEEN 5 AND 40),
  service text NOT NULL CHECK (service IN ('sourcing',
'import-export',
'verification',
'logistics',
'consulting',
'private-label',
'general')),
  product text NOT NULL DEFAULT '' CHECK (char_length(product)<=240),
  quantity text NOT NULL DEFAULT '' CHECK (char_length(quantity)<=80),
  origin text NOT NULL DEFAULT '' CHECK (char_length(origin)<=120),
  destination text NOT NULL CHECK (char_length(destination) BETWEEN 1 AND 120),
  timeline text NOT NULL DEFAULT '' CHECK (char_length(timeline)<=120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 6000),
  consent_at timestamptz NOT NULL DEFAULT now(),
status text NOT NULL DEFAULT 'new' check(status IN ('new',
'reviewing',
'quoted',
'closed')),
attachments JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(attachments)='array'
AND jsonb_array_length(attachments)<=3),
  created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX website_requests_created_idx ON public.website_requests(created_at DESC);
CREATE INDEX website_requests_status_idx ON public.website_requests(status);
ALTER TABLE public.website_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_requests
FROM anon,
  authenticated;
GRANT
SELECT ON public.website_requests TO authenticated;
GRANT update(status) ON public.website_requests TO authenticated;
CREATE policy "Only staff may read requests" ON public.website_requests
FOR
SELECT TO authenticated USING (exists
(SELECT 1
FROM public.staff_members
WHERE user_id=
(SELECT auth.uid())));
CREATE policy "Only staff may update status" ON public.website_requests
FOR
UPDATE TO authenticated USING (exists
(SELECT 1
FROM public.staff_members
WHERE user_id=
(SELECT auth.uid()))) WITH CHECK (exists
(SELECT 1
FROM public.staff_members
WHERE user_id=
(SELECT auth.uid())));
CREATE FUNCTION public.jkm_touch_request() RETURNS TRIGGER LANGUAGE PLPGSQL
SET search_path = '' AS $$ begin new.updated_at=now(); return new; end; $$;
CREATE TRIGGER website_requests_updated
BEFORE
UPDATE ON public.website_requests
FOR EACH ROW EXECUTE FUNCTION public.jkm_touch_request();
INSERT INTO storage.buckets(id,
name,
  PUBLIC,
  file_size_limit,
  allowed_mime_types)
VALUES ('request-files','request-files',FALSE,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
CREATE policy "Only staff may read enquiry files" ON storage.objects
FOR
SELECT TO authenticated USING (bucket_id='request-files'
AND exists
(SELECT 1
FROM public.staff_members
WHERE user_id=
(SELECT auth.uid())));
-- No anonymous table INSERT or storage policies: all public submissions go through the validated Edge Function.
COMMIT;
