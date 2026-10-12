BEGIN;
-- Block signups during the backfill so every account receives a default calendar.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name text NOT NULL CHECK (private.valid_name(name)),
  name_key text GENERATED ALWAYS AS (lower(private.clean_name(name))) STORED,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id), CONSTRAINT calendars_unique_name UNIQUE(user_id,name_key)
);
CREATE UNIQUE INDEX calendars_one_default ON public.calendars(user_id) WHERE is_default;
INSERT INTO public.calendars(user_id,name,is_default) SELECT user_id,'Mój kalendarz',true FROM public.profiles;
ALTER TABLE public.labels ADD COLUMN calendar_id uuid;
ALTER TABLE public.day_labels ADD COLUMN calendar_id uuid;
UPDATE public.labels l SET calendar_id=c.id FROM public.calendars c WHERE c.user_id=l.user_id AND c.is_default;
UPDATE public.day_labels d SET calendar_id=c.id FROM public.calendars c WHERE c.user_id=d.user_id AND c.is_default;
ALTER TABLE public.labels ALTER COLUMN calendar_id SET NOT NULL;
ALTER TABLE public.day_labels ALTER COLUMN calendar_id SET NOT NULL;
ALTER TABLE public.labels ADD CONSTRAINT labels_calendar_owner FOREIGN KEY(user_id,calendar_id) REFERENCES public.calendars(user_id,id) ON DELETE CASCADE;
ALTER TABLE public.labels ADD CONSTRAINT labels_calendar_identity UNIQUE(user_id,calendar_id,id);
ALTER TABLE public.day_labels ADD CONSTRAINT day_labels_same_calendar FOREIGN KEY(user_id,calendar_id,label_id) REFERENCES public.labels(user_id,calendar_id,id) ON DELETE CASCADE;
ALTER TABLE public.day_labels DROP CONSTRAINT day_labels_user_id_day_label_id_key;
ALTER TABLE public.day_labels ADD CONSTRAINT day_labels_unique_calendar_day UNIQUE(user_id,calendar_id,day,label_id);
DROP INDEX public.labels_unique_reusable_name;
CREATE UNIQUE INDEX labels_unique_reusable_name ON public.labels(user_id,calendar_id,name_key) WHERE kind='reusable';
CREATE INDEX day_labels_calendar_day ON public.day_labels(user_id,calendar_id,day);
CREATE INDEX labels_calendar_status ON public.labels(user_id,calendar_id,status,name_key);
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_select ON public.calendars FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.calendars FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.calendars TO authenticated;

CREATE OR REPLACE FUNCTION private.on_signup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO public.profiles(user_id,username) VALUES(NEW.id,NEW.raw_user_meta_data->>'username');
  INSERT INTO public.calendar_state(user_id) VALUES(NEW.id);
  INSERT INTO public.preferences(user_id) VALUES(NEW.id);
  INSERT INTO public.calendars(user_id,name,is_default) VALUES(NEW.id,'Mój kalendarz',true);
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.get_calendars_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); result jsonb;
BEGIN
  IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u) THEN RAISE EXCEPTION USING MESSAGE='AUTH_REQUIRED',DETAIL='Zaloguj się ponownie.'; END IF;
  SELECT jsonb_build_object('schema_version',2,'minimum_protocol_version',2,'revision',s.revision::text,
    'profile',jsonb_build_object('username',p.username),'preferences',f.value,
    'calendars',COALESCE((SELECT jsonb_agg(to_jsonb(c)-'user_id'-'name_key' ORDER BY c.created_at,c.id) FROM public.calendars c WHERE c.user_id=u),'[]'::jsonb),
    'labels',COALESCE((SELECT jsonb_agg(to_jsonb(l)-'user_id'-'name_key' ORDER BY l.id) FROM public.labels l WHERE l.user_id=u),'[]'::jsonb),
    'day_labels',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'user_id' ORDER BY d.created_at,d.id) FROM public.day_labels d WHERE d.user_id=u),'[]'::jsonb)
  ) INTO result FROM public.calendar_state s JOIN public.profiles p USING(user_id) JOIN public.preferences f USING(user_id) WHERE s.user_id=u;
  RETURN result;
END;
$$;
-- Old installed PWAs see only the original calendar and can flush their existing queue.
CREATE OR REPLACE FUNCTION public.get_calendar_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s jsonb; default_id text;
BEGIN
  s:=public.get_calendars_snapshot();
  SELECT value->>'id' INTO default_id FROM jsonb_array_elements(s->'calendars') WHERE value->'is_default'='true'::jsonb;
  RETURN jsonb_build_object('schema_version',1,'minimum_protocol_version',1,'revision',s->>'revision','profile',s->'profile','preferences',s->'preferences',
    'labels',COALESCE((SELECT jsonb_agg(value-'calendar_id') FROM jsonb_array_elements(s->'labels') WHERE value->>'calendar_id'=default_id),'[]'::jsonb),
    'day_labels',COALESCE((SELECT jsonb_agg(value-'calendar_id') FROM jsonb_array_elements(s->'day_labels') WHERE value->>'calendar_id'=default_id),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.apply_calendars_operation(operation_id uuid,expected_revision bigint,operation_type text,payload jsonb,client_schema_version integer DEFAULT 2)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  u uuid:=auth.uid(); rev bigint; previous public.applied_operations%ROWTYPE; hash text;
  cid uuid; default_cid uuid; lid uuid; k text; st text; result jsonb; item jsonb; source jsonb;
  old_day_ids uuid[]; old_label_exists boolean; import_map jsonb:='{}'::jsonb; calendar_map jsonb:='{}'::jsonb;
  import_day_ids jsonb:='{}'::jsonb; imported_id uuid; imported_cid uuid; constraint_name text; legacy_import boolean;
BEGIN
  IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u) THEN RAISE EXCEPTION USING MESSAGE='AUTH_REQUIRED',DETAIL='Zaloguj się ponownie.'; END IF;
  IF client_schema_version NOT IN (1,2) OR client_schema_version IS NULL THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Zaktualizuj aplikację. Kolejka zostanie zachowana.'; END IF;
  IF operation_id IS NULL OR payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Niepoprawna operacja.'; END IF;
  SELECT revision INTO rev FROM public.calendar_state WHERE user_id=u FOR UPDATE;
  hash:=encode(sha256(convert_to(jsonb_build_object('type',operation_type,'payload',payload)::text,'UTF8')),'hex');
  SELECT * INTO previous FROM public.applied_operations a WHERE a.user_id=u AND a.operation_id=apply_calendars_operation.operation_id;
  IF FOUND THEN
    IF previous.payload_hash<>hash THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Identyfikator operacji został użyty z innymi danymi.'; END IF;
    IF previous.response->>'schema_version'='1' THEN RETURN jsonb_build_object('operation_id',operation_id,'revision',previous.committed_revision::text,'schema_version',2,'requires_snapshot',true); END IF;
    RETURN previous.response;
  END IF;
  IF expected_revision IS DISTINCT FROM rev THEN RAISE EXCEPTION USING MESSAGE='REVISION_CONFLICT',DETAIL='Kalendarze zmieniły się na innym urządzeniu.'; END IF;
  SELECT id INTO default_cid FROM public.calendars WHERE user_id=u AND is_default;
  cid:=COALESCE((payload->>'calendar_id')::uuid,default_cid);
  IF client_schema_version=1 AND (cid IS DISTINCT FROM default_cid OR operation_type IN ('create_calendar','rename_calendar')) THEN RAISE EXCEPTION USING MESSAGE='FORBIDDEN',DETAIL='Zaktualizuj aplikację, aby używać dodatkowych kalendarzy.'; END IF;
  IF operation_type='create_calendar' THEN
    IF payload->>'calendar_id' IS NULL THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Brak identyfikatora kalendarza.'; END IF;
  ELSIF operation_type NOT IN ('update_preferences','replace_from_backup') THEN
    IF NOT EXISTS(SELECT 1 FROM public.calendars WHERE user_id=u AND id=cid) THEN RAISE EXCEPTION USING MESSAGE='CALENDAR_NOT_FOUND',DETAIL='Kalendarz nie istnieje lub nie należy do konta.'; END IF;
  END IF;
  IF operation_type NOT IN ('create_calendar','rename_calendar','update_preferences','replace_from_backup') THEN
    lid:=(payload->>'label_id')::uuid;
    IF lid IS NULL THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Brak identyfikatora oznaczenia.'; END IF;
  END IF;
  IF operation_type IN ('update_label','set_label_status','delete_label','assign_label','promote_label') THEN
    SELECT kind,status INTO k,st FROM public.labels WHERE id=lid AND user_id=u AND calendar_id=cid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='LABEL_NOT_FOUND',DETAIL='Oznaczenie nie istnieje w tym kalendarzu.'; END IF;
  END IF;
  IF operation_type IN ('assign_label','unassign_label','create_and_assign') AND ((payload->>'day')!~'^\d{4}-\d{2}-\d{2}$' OR payload->>'day' IS NULL) THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Niepoprawna data.'; END IF;
  SELECT array_agg(id) INTO old_day_ids FROM public.day_labels WHERE user_id=u AND calendar_id=cid AND label_id=lid;
  old_label_exists:=EXISTS(SELECT 1 FROM public.labels WHERE user_id=u AND calendar_id=cid AND id=lid);
  CASE operation_type
    WHEN 'create_calendar' THEN INSERT INTO public.calendars(id,user_id,name) VALUES(cid,u,private.clean_name(payload->>'name'));
    WHEN 'rename_calendar' THEN UPDATE public.calendars SET name=private.clean_name(payload->>'name'),updated_at=now() WHERE id=cid AND user_id=u;
    WHEN 'create_label','create_and_assign' THEN
      k:=CASE WHEN operation_type='create_label' THEN 'reusable' ELSE payload->>'kind' END;
      INSERT INTO public.labels(id,user_id,calendar_id,kind,status,name,emoji,color_hex) VALUES(lid,u,cid,k,'active',private.clean_name(payload->>'name'),payload->>'emoji',payload->>'color');
      IF operation_type='create_and_assign' THEN INSERT INTO public.day_labels(id,user_id,calendar_id,day,label_id) VALUES((payload->>'day_label_id')::uuid,u,cid,(payload->>'day')::date,lid); END IF;
    WHEN 'update_label' THEN UPDATE public.labels SET name=private.clean_name(payload->>'name'),emoji=payload->>'emoji',color_hex=payload->>'color',kind=CASE WHEN payload->'promote'='true'::jsonb THEN 'reusable' ELSE kind END,updated_at=now() WHERE id=lid AND user_id=u AND calendar_id=cid;
    WHEN 'set_label_status' THEN
      IF k<>'reusable' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Nie można archiwizować jednorazowego oznaczenia.'; END IF;
      UPDATE public.labels SET status=payload->>'status',updated_at=now() WHERE id=lid AND user_id=u AND calendar_id=cid;
    WHEN 'delete_label' THEN DELETE FROM public.labels WHERE id=lid AND user_id=u AND calendar_id=cid;
    WHEN 'assign_label' THEN
      IF k<>'reusable' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Oznaczenie jest jednorazowe.'; END IF;
      IF st<>'active' THEN RAISE EXCEPTION USING MESSAGE='LABEL_ARCHIVED',DETAIL='Najpierw przywróć oznaczenie.'; END IF;
      INSERT INTO public.day_labels(id,user_id,calendar_id,day,label_id) VALUES((payload->>'day_label_id')::uuid,u,cid,(payload->>'day')::date,lid) ON CONFLICT(user_id,calendar_id,day,label_id) DO NOTHING;
    WHEN 'unassign_label' THEN
      DELETE FROM public.day_labels WHERE label_id=lid AND user_id=u AND calendar_id=cid AND day=(payload->>'day')::date;
      DELETE FROM public.labels WHERE id=lid AND user_id=u AND calendar_id=cid AND kind='one_off' AND NOT EXISTS(SELECT 1 FROM public.day_labels WHERE label_id=lid AND user_id=u);
    WHEN 'promote_label' THEN UPDATE public.labels SET kind='reusable',updated_at=now() WHERE id=lid AND user_id=u AND calendar_id=cid;
    WHEN 'update_preferences' THEN UPDATE public.preferences SET value=payload,updated_at=now() WHERE user_id=u;
    WHEN 'replace_from_backup' THEN
      source:=payload; legacy_import:=client_schema_version=1 AND source->>'schema_version'='1';
      IF (NOT legacy_import AND source->>'schema_version' IS DISTINCT FROM '2') OR jsonb_typeof(source->'labels') IS DISTINCT FROM 'array' OR jsonb_typeof(source->'day_labels') IS DISTINCT FROM 'array' OR private.preferences_valid(source->'preferences') IS DISTINCT FROM TRUE OR octet_length(source::text)>20971520 THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Niepoprawna kopia lub rozmiar ponad 20 MB.'; END IF;
      IF legacy_import THEN
        DELETE FROM public.labels WHERE user_id=u AND calendar_id=default_cid;
      ELSE
        IF jsonb_typeof(source->'calendars') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Brak kalendarzy w kopii.'; END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(source->'calendars') WHERE value->'is_default'='true'::jsonb)<>1 THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Kopia musi mieć jeden kalendarz domyślny.'; END IF;
        DELETE FROM public.calendars WHERE user_id=u;
        FOR item IN SELECT value FROM jsonb_array_elements(source->'calendars') LOOP
          PERFORM (item->>'id')::uuid;
          IF item->>'id' IS NULL OR calendar_map?(item->>'id') THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Powtórzony kalendarz w kopii.'; END IF;
          imported_cid:=gen_random_uuid(); calendar_map:=calendar_map||jsonb_build_object(item->>'id',imported_cid::text);
          INSERT INTO public.calendars(id,user_id,name,is_default) VALUES(imported_cid,u,private.clean_name(item->>'name'),(item->>'is_default')::boolean);
        END LOOP;
      END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(source->'labels') LOOP
        PERFORM (item->>'id')::uuid;
        IF item->>'id' IS NULL OR import_map?(item->>'id') THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Powtórzony identyfikator oznaczenia w kopii.'; END IF;
        imported_id:=gen_random_uuid(); import_map:=import_map||jsonb_build_object(item->>'id',imported_id::text);
        imported_cid:=CASE WHEN legacy_import THEN default_cid ELSE (calendar_map->>(item->>'calendar_id'))::uuid END;
        INSERT INTO public.labels(id,user_id,calendar_id,kind,status,name,emoji,color_hex) VALUES(imported_id,u,imported_cid,item->>'kind',item->>'status',private.clean_name(item->>'name'),item->>'emoji',item->>'color_hex');
      END LOOP;
      FOR item IN SELECT value FROM jsonb_array_elements(source->'day_labels') LOOP
        IF item->>'day'!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Niepoprawna data w kopii.'; END IF;
        PERFORM (item->>'id')::uuid;
        IF item->>'id' IS NULL OR import_day_ids?(item->>'id') THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Powtórzony identyfikator wpisu w kopii.'; END IF;
        import_day_ids:=import_day_ids||jsonb_build_object(item->>'id',true);
        imported_cid:=CASE WHEN legacy_import THEN default_cid ELSE (calendar_map->>(item->>'calendar_id'))::uuid END;
        INSERT INTO public.day_labels(id,user_id,calendar_id,day,label_id,created_at) VALUES(gen_random_uuid(),u,imported_cid,(item->>'day')::date,(import_map->>(item->>'label_id'))::uuid,(item->>'created_at')::timestamptz);
      END LOOP;
      IF EXISTS(SELECT 1 FROM public.labels l WHERE l.user_id=u AND l.kind='one_off' AND NOT EXISTS(SELECT 1 FROM public.day_labels d WHERE d.user_id=u AND d.label_id=l.id)) THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Jednorazowe oznaczenie nie ma przypisania.'; END IF;
      UPDATE public.preferences SET value=source->'preferences',updated_at=now() WHERE user_id=u;
    ELSE RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Nieznana operacja.';
  END CASE;
  UPDATE public.calendar_state SET revision=revision+1,updated_at=now() WHERE user_id=u RETURNING revision INTO rev;
  result:=jsonb_build_object('operation_id',operation_id,'revision',rev::text,'schema_version',2,'requires_snapshot',operation_type='replace_from_backup',
    'calendars',CASE WHEN operation_type IN ('create_calendar','rename_calendar') THEN COALESCE((SELECT jsonb_agg(to_jsonb(c)-'user_id'-'name_key') FROM public.calendars c WHERE user_id=u AND id=cid),'[]'::jsonb) ELSE '[]'::jsonb END,
    'labels',COALESCE((SELECT jsonb_agg(to_jsonb(l)-'user_id'-'name_key') FROM public.labels l WHERE user_id=u AND calendar_id=cid AND id=lid),'[]'::jsonb),
    'day_labels',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'user_id') FROM public.day_labels d WHERE user_id=u AND calendar_id=cid AND label_id=lid AND NOT(id=ANY(COALESCE(old_day_ids,ARRAY[]::uuid[])))),'[]'::jsonb),
    'deleted_label_ids',CASE WHEN old_label_exists AND NOT EXISTS(SELECT 1 FROM public.labels WHERE user_id=u AND calendar_id=cid AND id=lid) THEN jsonb_build_array(lid) ELSE '[]'::jsonb END,
    'deleted_day_ids',COALESCE((SELECT jsonb_agg(gone.gone_id) FROM unnest(old_day_ids) AS gone(gone_id) WHERE NOT EXISTS(SELECT 1 FROM public.day_labels d WHERE d.user_id=u AND d.id=gone.gone_id)),'[]'::jsonb),
    'preferences',CASE WHEN operation_type='update_preferences' THEN payload ELSE NULL END);
  INSERT INTO public.applied_operations(user_id,operation_id,payload_hash,committed_revision,response) VALUES(u,operation_id,hash,rev,result);
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;
    IF constraint_name='calendars_unique_name' THEN RAISE EXCEPTION USING MESSAGE='CALENDAR_NAME_CONFLICT',DETAIL='Kalendarz o tej nazwie już istnieje.'; END IF;
    RAISE EXCEPTION USING MESSAGE='NAME_CONFLICT',DETAIL='Powtórzona nazwa lub identyfikator.';
  WHEN check_violation OR not_null_violation OR foreign_key_violation OR invalid_text_representation OR datetime_field_overflow THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Niepoprawne dane operacji.';
END;
$$;
CREATE OR REPLACE FUNCTION public.apply_calendar_operation(operation_id uuid,expected_revision bigint,operation_type text,payload jsonb,client_schema_version integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF client_schema_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR',DETAIL='Zaktualizuj aplikację.'; END IF;
  result:=public.apply_calendars_operation(operation_id,expected_revision,operation_type,payload,1);
  RETURN (result-'calendars')||jsonb_build_object('schema_version',1,
    'labels',COALESCE((SELECT jsonb_agg(value-'calendar_id') FROM jsonb_array_elements(COALESCE(result->'labels','[]'::jsonb))),'[]'::jsonb),
    'day_labels',COALESCE((SELECT jsonb_agg(value-'calendar_id') FROM jsonb_array_elements(COALESCE(result->'day_labels','[]'::jsonb))),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_calendars_snapshot(),public.apply_calendars_operation(uuid,bigint,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendars_snapshot(),public.apply_calendars_operation(uuid,bigint,text,jsonb,integer) TO authenticated;
COMMIT;
