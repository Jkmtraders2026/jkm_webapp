-- Adopt a complete existing installation, or initialise an empty project.
-- Never silently replace partial/unknown schemas or production records.
BEGIN;
DO $bootstrap$
DECLARE request_tables integer; app_tables integer; has_role boolean;
BEGIN
 SELECT count(*) INTO request_tables FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('staff_members','website_requests');
 IF request_tables=0 THEN
  EXECUTE $website$
CREATE TABLE public.staff_members
  (user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now());


ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_members
FROM anon, authenticated;

GRANT
SELECT ON public.staff_members TO authenticated;


CREATE policy "Staff can check own membership" ON public.staff_members
FOR
SELECT TO authenticated USING (user_id =
                                 (SELECT auth.uid()));


CREATE TABLE public.website_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE,
                                                                                                             full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120), company text NOT NULL DEFAULT '' CHECK (char_length(company)<=160), email text NOT NULL CHECK (char_length(email)<=200), phone text NOT NULL CHECK (char_length(phone) BETWEEN 5 AND 40), service text NOT NULL CHECK (service IN ('sourcing',
                                                                                                                                                                                                                                                                                                                                                                                                                          'import-export',
                                                                                                                                                                                                                                                                                                                                                                                                                          'verification',
                                                                                                                                                                                                                                                                                                                                                                                                                          'logistics',
                                                                                                                                                                                                                                                                                                                                                                                                                          'consulting',
                                                                                                                                                                                                                                                                                                                                                                                                                          'private-label',
                                                                                                                                                                                                                                                                                                                                                                                                                          'general')), product text NOT NULL DEFAULT '' CHECK (char_length(product)<=240), quantity text NOT NULL DEFAULT '' CHECK (char_length(quantity)<=80), origin text NOT NULL DEFAULT '' CHECK (char_length(origin)<=120), destination text NOT NULL CHECK (char_length(destination) BETWEEN 1 AND 120), timeline text NOT NULL DEFAULT '' CHECK (char_length(timeline)<=120), message text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 6000), consent_at timestamptz NOT NULL DEFAULT now(),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      status text NOT NULL DEFAULT 'new' check(status IN ('new',

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      'reviewing',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      'quoted',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      'closed')),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         attachments JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(attachments)='array'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               AND jsonb_array_length(attachments)<=3), created_at timestamptz NOT NULL DEFAULT now(),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                updated_at timestamptz NOT NULL DEFAULT now());


CREATE INDEX website_requests_created_idx ON public.website_requests(created_at DESC);


CREATE INDEX website_requests_status_idx ON public.website_requests(status);


ALTER TABLE public.website_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.website_requests
FROM anon, authenticated;

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
                      name, PUBLIC, file_size_limit, allowed_mime_types)
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
$website$;
 ELSIF request_tables<>2 THEN
  RAISE EXCEPTION 'Partial website schema found. Review the database before deployment.';
 END IF;
 SELECT count(*) INTO app_tables FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('customers','suppliers','quotations','orders','shipments','payments');
 SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name='staff_members' AND column_name='role') INTO has_role;
 IF app_tables=0 AND NOT has_role THEN
  EXECUTE $workspace$
ALTER TABLE public.staff_members ADD COLUMN role text NOT NULL DEFAULT 'operations'
  CHECK (role IN ('admin','operations','finance'));

CREATE FUNCTION public.jkm_has_role(allowed text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.staff_members
    WHERE user_id=(SELECT auth.uid()) AND role=ANY(allowed));
$$;
REVOKE ALL ON FUNCTION public.jkm_has_role(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jkm_has_role(text[]) TO authenticated;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 240),
  company text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 240),
  contact_name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '',
  verification_status text NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','documents_checked','inspection_completed','on_hold')),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('QT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  service text NOT NULL CHECK(service IN ('sourcing','import-export','verification','logistics','consulting','private-label','general')),
  currency text NOT NULL CHECK(currency IN ('TZS','USD','AED')),
  items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
  service_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK(service_fee BETWEEN 0 AND 999999999999.99),
  shipping_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK(shipping_cost BETWEEN 0 AND 999999999999.99),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK(total BETWEEN 0 AND 999999999999.99),
  valid_until date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected')),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('ORD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 240),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  quotation_id uuid UNIQUE REFERENCES public.quotations(id),
  source_request_id uuid UNIQUE REFERENCES public.website_requests(id),
  service text NOT NULL CHECK(service IN ('sourcing','import-export','verification','logistics','consulting','private-label','general')),
  currency text NOT NULL CHECK(currency IN ('TZS','USD','AED')),
  agreed_amount numeric(14,2) NOT NULL CHECK(agreed_amount BETWEEN 0 AND 999999999999.99),
  estimated_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK(estimated_cost BETWEEN 0 AND 999999999999.99),
  due_date date,
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','sourcing','awaiting_approval','purchasing','inspection','ready_to_ship','in_transit','delivered','cancelled')),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('SHP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  carrier text NOT NULL DEFAULT '', tracking_number text NOT NULL DEFAULT '',
  origin text NOT NULL CHECK(length(trim(origin)) BETWEEN 1 AND 240),
  destination text NOT NULL CHECK(length(trim(destination)) BETWEEN 1 AND 240),
  method text NOT NULL CHECK(method IN ('air','sea','road')),
  status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','collected','in_transit','customs','delivered','on_hold')),
  estimated_arrival date, notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('PAY-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount<=999999999999.99),
  currency text NOT NULL CHECK(currency IN ('TZS','USD','AED')),
  method text NOT NULL CHECK(method IN ('bank','mobile_money','cash','other')),
  payment_date date NOT NULL,
  external_reference text NOT NULL CHECK(length(trim(external_reference)) BETWEEN 1 AND 240),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,external_reference)
);

-- Preserve authorship and creation metadata on updates.
CREATE FUNCTION public.jkm_touch_record() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
  NEW.id=OLD.id; NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at;
  NEW.updated_at=clock_timestamp();
  IF TG_TABLE_NAME IN ('quotations','orders','shipments') THEN NEW.reference=OLD.reference; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.jkm_validate_quote() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; quantity numeric; price numeric; calculated numeric;
BEGIN
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.orders WHERE quotation_id=OLD.id) THEN
    RAISE EXCEPTION 'Quotation is linked to an order and cannot be edited; create a revision.';
  END IF;
  IF jsonb_typeof(NEW.items)<>'array' OR jsonb_array_length(NEW.items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Quotation must contain 1 to 100 items.';
  END IF;
  calculated=NEW.service_fee+NEW.shipping_cost;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    IF jsonb_typeof(item)<>'object' OR coalesce(length(trim(item->>'description')),0) NOT BETWEEN 1 AND 500
      OR coalesce(item->>'quantity','') !~ '^[0-9]{1,7}$'
      OR coalesce(item->>'unit_price','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Invalid quotation item.';
    END IF;
    quantity=(item->>'quantity')::numeric; price=(item->>'unit_price')::numeric;
    IF quantity NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'Invalid item quantity.'; END IF;
    calculated=calculated+quantity*price;
  END LOOP;
  NEW.total=calculated;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.jkm_validate_order() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE paid numeric; q public.quotations%ROWTYPE;
BEGIN
  IF NEW.quotation_id IS NOT NULL THEN
    SELECT * INTO q FROM public.quotations WHERE id=NEW.quotation_id FOR UPDATE;
    IF NOT FOUND OR q.status<>'accepted' OR q.customer_id<>NEW.customer_id
      OR q.currency<>NEW.currency OR q.total<>NEW.agreed_amount OR q.service<>NEW.service THEN
      RAISE EXCEPTION 'Linked quotation must be accepted and match customer, currency, service and amount.';
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE order_id=OLD.id;
    IF paid>0 AND (NEW.currency<>OLD.currency OR NEW.customer_id<>OLD.customer_id OR NEW.status='cancelled') THEN
      RAISE EXCEPTION 'An order with payments cannot change customer, currency or be cancelled. Contact finance.';
    END IF;
    IF NEW.agreed_amount<paid THEN RAISE EXCEPTION 'Order value cannot be below recorded payments.'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.jkm_validate_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; paid numeric;
BEGIN
  IF NOT public.jkm_has_role(ARRAY['admin','finance']) THEN RAISE EXCEPTION 'Finance access required.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND OR o.status='cancelled' OR NEW.currency<>o.currency THEN RAISE EXCEPTION 'Select an active order with the same currency.'; END IF;
  SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE order_id=NEW.order_id;
  IF NEW.amount<=0 OR paid+NEW.amount>o.agreed_amount THEN RAISE EXCEPTION 'Payment exceeds the outstanding balance or is not positive.'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER quotation_validate BEFORE INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.jkm_validate_quote();
CREATE TRIGGER order_validate BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.jkm_validate_order();
CREATE TRIGGER payment_validate BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.jkm_validate_payment();

DO $$ DECLARE entity text; BEGIN
  FOREACH entity IN ARRAY ARRAY['customers','suppliers','quotations','orders','shipments','payments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',entity);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',entity);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',entity);
    EXECUTE format('CREATE POLICY staff_read ON public.%I FOR SELECT TO authenticated USING (public.jkm_has_role(ARRAY[''admin'',''operations'',''finance'']))',entity);
    EXECUTE format('CREATE INDEX ON public.%I (created_at DESC,id)',entity);
    IF entity='payments' THEN
      EXECUTE 'GRANT INSERT ON public.payments TO authenticated';
      EXECUTE 'CREATE POLICY finance_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (public.jkm_has_role(ARRAY[''admin'',''finance'']) AND created_by=(SELECT auth.uid()))';
    ELSE
      EXECUTE format('GRANT INSERT,UPDATE ON public.%I TO authenticated',entity);
      EXECUTE format('CREATE POLICY operations_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.jkm_has_role(ARRAY[''admin'',''operations'']) AND created_by=(SELECT auth.uid()))',entity);
      EXECUTE format('CREATE POLICY operations_update ON public.%I FOR UPDATE TO authenticated USING (public.jkm_has_role(ARRAY[''admin'',''operations''])) WITH CHECK (public.jkm_has_role(ARRAY[''admin'',''operations'']))',entity);
      EXECUTE format('CREATE TRIGGER a_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.jkm_touch_record()',entity);
    END IF;
  END LOOP;
END; $$;
CREATE INDEX ON public.quotations(customer_id);
CREATE INDEX ON public.orders(customer_id);
CREATE INDEX ON public.orders(supplier_id);
CREATE INDEX ON public.shipments(order_id);
CREATE INDEX ON public.payments(order_id);

-- Payment trigger locks orders with an explicit finance role check.
REVOKE ALL ON FUNCTION public.jkm_validate_payment() FROM PUBLIC,anon,authenticated;
-- Trigger execution does not require callers to have EXECUTE on the trigger function.
REVOKE ALL ON FUNCTION public.jkm_touch_record(), public.jkm_validate_quote(), public.jkm_validate_order() FROM PUBLIC;

DROP POLICY "Only staff may update status" ON public.website_requests;
CREATE POLICY "Only staff may update status" ON public.website_requests FOR UPDATE TO authenticated
  USING(public.jkm_has_role(ARRAY['admin','operations']))
  WITH CHECK(public.jkm_has_role(ARRAY['admin','operations']));
$workspace$;
 ELSIF app_tables<>6 OR NOT has_role THEN
  RAISE EXCEPTION 'Partial workspace schema found. Review the database before deployment.';
 END IF;
END;
$bootstrap$;
COMMIT;
