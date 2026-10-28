BEGIN;
-- Idempotency keys prevent uncertain network retries from creating a second enquiry.
ALTER TABLE public.website_requests
 ADD COLUMN IF NOT EXISTS submission_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS website_requests_submission_id_key
 ON public.website_requests(submission_id) WHERE submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity text NOT NULL,
 record_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE')),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 old_record jsonb,
 new_record jsonb NOT NULL
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
DROP POLICY IF EXISTS admin_audit_read ON public.audit_events;
CREATE POLICY admin_audit_read ON public.audit_events FOR SELECT TO authenticated
 USING(public.jkm_has_role(ARRAY['admin']));
CREATE INDEX IF NOT EXISTS audit_events_record_idx ON public.audit_events(entity,record_id,occurred_at DESC);
CREATE FUNCTION public.jkm_audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.audit_events(entity,record_id,operation,actor_id,old_record,new_record)
 VALUES(TG_TABLE_NAME,NEW.id,TG_OP,auth.uid(),
 CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.jkm_audit_change() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE entity text; BEGIN
 FOREACH entity IN ARRAY ARRAY['website_requests','customers','suppliers','quotations','orders','shipments','payments'] LOOP
  EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.jkm_audit_change()',entity);
 END LOOP;
END; $$;
-- Supabase Realtime is optional; the app also polls so the inbox remains functional.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
 AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
  AND schemaname='public' AND tablename='website_requests') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.website_requests;
 END IF;
END; $$;
COMMIT;
