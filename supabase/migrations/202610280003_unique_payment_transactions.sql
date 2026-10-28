BEGIN;
-- Do not discard historical records automatically. Resolve existing duplicate
-- transaction references before deploying this migration if the index rejects them.
CREATE UNIQUE INDEX payments_method_external_reference_key
 ON public.payments(method,lower(btrim(external_reference)));
COMMIT;
