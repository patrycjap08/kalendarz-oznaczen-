BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE private.supported_emoji (emoji text PRIMARY KEY);
CREATE TABLE private.auth_rate_limits (key text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(key, window_start));
CREATE TABLE private.deleted_accounts (user_id uuid PRIMARY KEY, deleted_at timestamptz NOT NULL DEFAULT now());

CREATE FUNCTION private.clean_name(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT normalize(btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),NFC);
$$;
CREATE FUNCTION private.valid_name(value text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT value = private.clean_name(value) AND char_length(value) BETWEEN 1 AND 60 AND value !~ '[[:cntrl:]]';
$$;
CREATE FUNCTION private.preferences_valid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_typeof(p) = 'object' AND (SELECT count(*) FROM jsonb_object_keys(p)) = 8
    AND p->>'background' IN ('plain','warm','mist','sage','dots')
    AND p->>'calendar_style' IN ('simple','soft','editorial','mono')
    AND p->>'theme_mode' IN ('light','dark','system')
    AND p->>'marker_mode' IN ('dots','horizontal','vertical')
    AND p->>'dot_size' IN ('small','medium','auto')
    AND p->>'horizontal_emoji_position' IN ('top','left')
    AND p->>'vertical_emoji_position' IN ('top','left')
    AND jsonb_typeof(p->'show_emoji') = 'boolean';
$$;
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL CHECK (username ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$'),
  username_key text GENERATED ALWAYS AS (lower(username)) STORED UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.calendar_state (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.labels (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reusable','one_off')),
  status text NOT NULL CHECK (status IN ('active','archived') AND (kind <> 'one_off' OR status = 'active')),
  name text NOT NULL CHECK (private.valid_name(name)),
  name_key text GENERATED ALWAYS AS (lower(private.clean_name(name))) STORED,
  emoji text NOT NULL REFERENCES private.supported_emoji(emoji), color_hex text NOT NULL CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id)
);
CREATE UNIQUE INDEX labels_unique_reusable_name ON public.labels(user_id,name_key) WHERE kind = 'reusable';
CREATE INDEX labels_status ON public.labels(user_id,status,name_key);
CREATE TABLE public.day_labels (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  day date NOT NULL CHECK (day BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  label_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,day,label_id),
  FOREIGN KEY(user_id,label_id) REFERENCES public.labels(user_id,id) ON DELETE CASCADE
);
CREATE INDEX day_labels_day ON public.day_labels(user_id,day);
CREATE INDEX day_labels_label ON public.day_labels(user_id,label_id);
CREATE TABLE public.preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT '{"background":"plain","calendar_style":"simple","theme_mode":"system","marker_mode":"dots","show_emoji":true,"dot_size":"auto","horizontal_emoji_position":"left","vertical_emoji_position":"top"}'::jsonb CHECK (private.preferences_valid(value) IS TRUE),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.applied_operations (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  operation_id uuid NOT NULL, payload_hash text NOT NULL, committed_revision bigint NOT NULL,
  response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,operation_id)
);

CREATE FUNCTION private.on_signup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO public.profiles(user_id,username) VALUES(NEW.id, NEW.raw_user_meta_data->>'username');
  INSERT INTO public.calendar_state(user_id) VALUES(NEW.id);
  INSERT INTO public.preferences(user_id) VALUES(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER calendar_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.on_signup();
CREATE FUNCTION private.on_account_deleted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN INSERT INTO private.deleted_accounts(user_id) VALUES(OLD.id) ON CONFLICT DO NOTHING; RETURN OLD; END;
$$;
CREATE TRIGGER calendar_deletion_record AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.on_account_deleted();
CREATE FUNCTION private.check_one_off() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE k text;
BEGIN
  SELECT kind INTO k FROM public.labels WHERE user_id = NEW.user_id AND id = NEW.label_id FOR UPDATE;
  IF k = 'one_off' AND EXISTS(SELECT 1 FROM public.day_labels WHERE user_id = NEW.user_id AND label_id = NEW.label_id AND id <> NEW.id) THEN
    RAISE EXCEPTION USING MESSAGE = 'VALIDATION_ERROR', DETAIL = 'Jednorazowe oznaczenie może wystąpić tylko raz.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER day_label_one_off BEFORE INSERT OR UPDATE ON public.day_labels FOR EACH ROW EXECUTE FUNCTION private.check_one_off();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applied_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_select ON public.profiles FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY own_select ON public.calendar_state FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY own_select ON public.labels FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY own_select ON public.day_labels FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY own_select ON public.preferences FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY own_select ON public.applied_operations FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.profiles, public.calendar_state, public.labels, public.day_labels, public.preferences, public.applied_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles, public.calendar_state, public.labels, public.day_labels, public.preferences TO authenticated;

CREATE FUNCTION public.get_calendar_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid := auth.uid(); result jsonb;
BEGIN
  IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = u) THEN RAISE EXCEPTION USING MESSAGE='AUTH_REQUIRED', DETAIL='Zaloguj się ponownie.'; END IF;
  SELECT jsonb_build_object(
    'schema_version',1,'minimum_protocol_version',1,'revision',s.revision::text,
    'profile',jsonb_build_object('username',p.username),'preferences',f.value,
    'labels',COALESCE((SELECT jsonb_agg(to_jsonb(l) - 'user_id' - 'name_key' ORDER BY l.id) FROM public.labels l WHERE l.user_id=u),'[]'::jsonb),
    'day_labels',COALESCE((SELECT jsonb_agg(to_jsonb(d) - 'user_id' ORDER BY d.created_at,d.id) FROM public.day_labels d WHERE d.user_id=u),'[]'::jsonb)
  ) INTO result FROM public.calendar_state s JOIN public.profiles p USING(user_id) JOIN public.preferences f USING(user_id) WHERE s.user_id=u;
  RETURN result;
END;
$$;

CREATE FUNCTION public.apply_calendar_operation(operation_id uuid, expected_revision bigint, operation_type text, payload jsonb, client_schema_version integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  u uuid := auth.uid(); rev bigint; previous public.applied_operations%ROWTYPE;
  hash text; lid uuid; k text; st text; result jsonb; item jsonb; source jsonb; old_day_ids uuid[]; old_label_exists boolean; import_map jsonb := '{}'::jsonb; import_day_ids jsonb := '{}'::jsonb; imported_id uuid;
BEGIN
  IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u) THEN RAISE EXCEPTION USING MESSAGE='AUTH_REQUIRED', DETAIL='Zaloguj się ponownie.'; END IF;
  IF client_schema_version <> 1 THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Zaktualizuj aplikację. Kolejka zostanie zachowana.'; END IF;
  IF operation_id IS NULL OR payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Niepoprawne dane operacji.'; END IF;
  SELECT revision INTO rev FROM public.calendar_state WHERE user_id=u FOR UPDATE;
  hash := encode(sha256(convert_to(jsonb_build_object('type',operation_type,'payload',payload)::text,'UTF8')),'hex');
  SELECT * INTO previous FROM public.applied_operations a WHERE a.user_id=u AND a.operation_id=apply_calendar_operation.operation_id;
  IF FOUND THEN
    IF previous.payload_hash <> hash THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Identyfikator operacji został użyty z innymi danymi.'; END IF;
    RETURN previous.response;
  END IF;
  IF expected_revision IS DISTINCT FROM rev THEN RAISE EXCEPTION USING MESSAGE='REVISION_CONFLICT', DETAIL='Kalendarz zmienił się na innym urządzeniu.'; END IF;
  IF operation_type NOT IN ('update_preferences','replace_from_backup') THEN
    lid := (payload->>'label_id')::uuid;
    IF lid IS NULL THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Brak identyfikatora oznaczenia.'; END IF;
  END IF;
  IF operation_type IN ('update_label','set_label_status','delete_label','assign_label','promote_label') THEN
    SELECT kind,status INTO k,st FROM public.labels WHERE id=lid AND user_id=u FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='LABEL_NOT_FOUND', DETAIL='Oznaczenie już nie istnieje lub nie należy do tego konta.'; END IF;
  END IF;
  IF operation_type IN ('assign_label','unassign_label','create_and_assign') AND ((payload->>'day') !~ '^\d{4}-\d{2}-\d{2}$' OR payload->>'day' IS NULL) THEN
    RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Niepoprawna data.';
  END IF;
  SELECT array_agg(id) INTO old_day_ids FROM public.day_labels WHERE user_id=u AND label_id=lid;
  old_label_exists := EXISTS(SELECT 1 FROM public.labels WHERE user_id=u AND id=lid);
  CASE operation_type
    WHEN 'create_label', 'create_and_assign' THEN
      k := CASE WHEN operation_type='create_label' THEN 'reusable' ELSE payload->>'kind' END;
      INSERT INTO public.labels(id,user_id,kind,status,name,emoji,color_hex) VALUES(lid,u,k,'active',private.clean_name(payload->>'name'),payload->>'emoji',payload->>'color');
      IF operation_type='create_and_assign' THEN INSERT INTO public.day_labels(id,user_id,day,label_id) VALUES((payload->>'day_label_id')::uuid,u,(payload->>'day')::date,lid); END IF;
    WHEN 'update_label' THEN
      UPDATE public.labels SET name=private.clean_name(payload->>'name'),emoji=payload->>'emoji',color_hex=payload->>'color',kind=CASE WHEN payload->'promote'='true'::jsonb THEN 'reusable' ELSE kind END,updated_at=now() WHERE id=lid AND user_id=u;
    WHEN 'set_label_status' THEN
      IF k <> 'reusable' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Nie można archiwizować jednorazowego oznaczenia.'; END IF;
      UPDATE public.labels SET status=payload->>'status',updated_at=now() WHERE id=lid AND user_id=u;
    WHEN 'delete_label' THEN DELETE FROM public.labels WHERE id=lid AND user_id=u;
    WHEN 'assign_label' THEN
      IF k <> 'reusable' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Oznaczenie jest jednorazowe.'; END IF;
      IF st <> 'active' THEN RAISE EXCEPTION USING MESSAGE='LABEL_ARCHIVED', DETAIL='Najpierw przywróć oznaczenie.'; END IF;
      INSERT INTO public.day_labels(id,user_id,day,label_id) VALUES((payload->>'day_label_id')::uuid,u,(payload->>'day')::date,lid) ON CONFLICT(user_id,day,label_id) DO NOTHING;
    WHEN 'unassign_label' THEN
      DELETE FROM public.day_labels WHERE label_id=lid AND user_id=u AND day=(payload->>'day')::date;
      DELETE FROM public.labels WHERE id=lid AND user_id=u AND kind='one_off' AND NOT EXISTS(SELECT 1 FROM public.day_labels WHERE label_id=lid AND user_id=u);
    WHEN 'promote_label' THEN UPDATE public.labels SET kind='reusable',updated_at=now() WHERE id=lid AND user_id=u;
    WHEN 'update_preferences' THEN UPDATE public.preferences SET value=payload,updated_at=now() WHERE user_id=u;
    WHEN 'replace_from_backup' THEN
      source := payload;
      IF (source->>'schema_version')::integer IS DISTINCT FROM 1 OR jsonb_typeof(source->'labels') IS DISTINCT FROM 'array' OR jsonb_typeof(source->'day_labels') IS DISTINCT FROM 'array' OR private.preferences_valid(source->'preferences') IS DISTINCT FROM TRUE OR octet_length(source::text) > 20971520 THEN
        RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Niepoprawna kopia lub przekroczony rozmiar 20 MB.';
      END IF;
      DELETE FROM public.labels WHERE user_id=u;
      FOR item IN SELECT value FROM jsonb_array_elements(source->'labels') LOOP
        PERFORM (item->>'id')::uuid;
        IF item->>'id' IS NULL OR import_map ? (item->>'id') THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Powtórzony identyfikator w kopii.'; END IF;
        imported_id := gen_random_uuid(); import_map := import_map || jsonb_build_object(item->>'id',imported_id::text);
        INSERT INTO public.labels(id,user_id,kind,status,name,emoji,color_hex) VALUES(imported_id,u,item->>'kind',item->>'status',private.clean_name(item->>'name'),item->>'emoji',item->>'color_hex');
      END LOOP;
      FOR item IN SELECT value FROM jsonb_array_elements(source->'day_labels') LOOP
        IF item->>'day' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Niepoprawna data w kopii.'; END IF;
        PERFORM (item->>'id')::uuid;
        IF item->>'id' IS NULL OR import_day_ids ? (item->>'id') THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Powtórzony identyfikator wpisu w kopii.'; END IF;
        import_day_ids := import_day_ids || jsonb_build_object(item->>'id',true);
        INSERT INTO public.day_labels(id,user_id,day,label_id,created_at) VALUES(gen_random_uuid(),u,(item->>'day')::date,(import_map->>(item->>'label_id'))::uuid,(item->>'created_at')::timestamptz);
      END LOOP;
      IF EXISTS(SELECT 1 FROM public.labels l WHERE l.user_id=u AND l.kind='one_off' AND NOT EXISTS(SELECT 1 FROM public.day_labels d WHERE d.user_id=u AND d.label_id=l.id)) THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Jednorazowe oznaczenie nie ma przypisania.'; END IF;
      UPDATE public.preferences SET value=source->'preferences',updated_at=now() WHERE user_id=u;
    ELSE RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Nieznana operacja.';
  END CASE;
  UPDATE public.calendar_state SET revision=revision+1,updated_at=now() WHERE user_id=u RETURNING revision INTO rev;
  result := jsonb_build_object('operation_id',operation_id,'revision',rev::text,'schema_version',1,
    'requires_snapshot',operation_type='replace_from_backup',
    'labels',COALESCE((SELECT jsonb_agg(to_jsonb(l)-'user_id'-'name_key') FROM public.labels l WHERE user_id=u AND id=lid),'[]'::jsonb),
    'day_labels',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'user_id') FROM public.day_labels d WHERE user_id=u AND label_id=lid AND NOT(id=ANY(COALESCE(old_day_ids,ARRAY[]::uuid[])))),'[]'::jsonb),
    'deleted_label_ids',CASE WHEN old_label_exists AND NOT EXISTS(SELECT 1 FROM public.labels WHERE user_id=u AND id=lid) THEN jsonb_build_array(lid) ELSE '[]'::jsonb END,
    'deleted_day_ids',COALESCE((SELECT jsonb_agg(gone.gone_id) FROM unnest(old_day_ids) AS gone(gone_id) WHERE NOT EXISTS(SELECT 1 FROM public.day_labels d WHERE d.user_id=u AND d.id=gone.gone_id)),'[]'::jsonb),
    'preferences',CASE WHEN operation_type='update_preferences' THEN payload ELSE NULL END);
  INSERT INTO public.applied_operations(user_id,operation_id,payload_hash,committed_revision,response) VALUES(u,operation_id,hash,rev,result);
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING MESSAGE='NAME_CONFLICT', DETAIL='Powtórzona nazwa lub identyfikator; sprawdź także archiwum.';
  WHEN check_violation OR not_null_violation OR foreign_key_violation OR invalid_text_representation OR datetime_field_overflow THEN RAISE EXCEPTION USING MESSAGE='VALIDATION_ERROR', DETAIL='Niepoprawne dane operacji.';
END;
$$;

CREATE FUNCTION public.get_calendar_revision() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid := auth.uid(); r text;
BEGIN
  SELECT revision::text INTO r FROM public.calendar_state WHERE user_id=u;
  IF r IS NULL THEN RAISE EXCEPTION USING MESSAGE='AUTH_REQUIRED', DETAIL='Zaloguj się ponownie.'; END IF;
  RETURN r;
END;
$$;

CREATE FUNCTION public.consume_auth_limit(limit_key text, limit_count integer, window_seconds integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE start_at timestamptz; attempts integer; retry integer;
BEGIN
  IF length(limit_key) <> 64 OR limit_count < 1 OR window_seconds NOT IN (900,3600) THEN RAISE EXCEPTION 'Invalid limit configuration'; END IF;
  start_at := to_timestamp(floor(extract(epoch FROM now()) / window_seconds) * window_seconds);
  INSERT INTO private.auth_rate_limits(key,window_start,count,expires_at) VALUES(limit_key,start_at,1,start_at + make_interval(secs => window_seconds*2))
    ON CONFLICT(key,window_start) DO UPDATE SET count=private.auth_rate_limits.count+1 RETURNING count INTO attempts;
  DELETE FROM private.auth_rate_limits WHERE expires_at < now();
  retry := greatest(1,ceil(extract(epoch FROM start_at + make_interval(secs => window_seconds) - now()))::integer);
  RETURN CASE WHEN attempts > limit_count THEN retry ELSE 0 END;
END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_calendar_snapshot(),public.get_calendar_revision(),public.apply_calendar_operation(uuid,bigint,text,jsonb,integer),public.consume_auth_limit(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_snapshot(),public.get_calendar_revision(),public.apply_calendar_operation(uuid,bigint,text,jsonb,integer) TO authenticated;
GRANT SELECT ON public.profiles TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_auth_limit(text,integer,integer) TO service_role;
COMMIT;
