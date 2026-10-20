-- +goose Up
-- Collision checks fail before choosing an identity or changing any old row.
-- +goose StatementBegin
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pictures p JOIN attachments a ON a.id=p.id OR a.staging_key=p.staging_key OR a.published_key=p.published_key)
 OR EXISTS(SELECT 1 FROM upload_reservations p JOIN attachment_upload_reservations a ON (a.actor_id,a.retry_reference)=(p.actor_id,p.retry_reference) OR a.attachment_id=p.picture_id OR a.staging_key=p.staging_key) THEN
  RAISE EXCEPTION 'Legacy media identities, keys or upload references collide; reconcile the reported preflight before expansion' USING ERRCODE='23505';
 END IF;
END $$;
-- +goose StatementEnd
CREATE TABLE asset_attachments (
 id uuid PRIMARY KEY,project_id uuid NOT NULL,issue_id uuid NOT NULL,uploaded_by uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN('image','file')),filename text NOT NULL CHECK(char_length(filename) BETWEEN 1 AND 255),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=200),mime_type text NOT NULL,
 byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 104857600),checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'),
 staging_key text NOT NULL UNIQUE,staging_generation bigint NOT NULL CHECK(staging_generation>0),
 published_key text UNIQUE,published_generation bigint CHECK(published_generation>0),
 state text NOT NULL CHECK(state IN('draft','published','expired')),in_panel boolean NOT NULL DEFAULT false,
 uploaded_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,published_at timestamptz,
 UNIQUE(project_id,issue_id,id),UNIQUE(issue_id,id),FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id),
 CHECK((kind='image' AND mime_type IN('image/png','image/jpeg','image/webp') AND byte_size<=10485760 AND char_length(description)>0)
 OR(kind='file' AND mime_type IN('application/octet-stream','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))),
 CHECK((published_key IS NULL)=(published_generation IS NULL)),
 CHECK(state<>'published' OR published_key IS NOT NULL),CHECK(state<>'draft' OR (expires_at IS NOT NULL AND published_key IS NULL)),
 CHECK(NOT in_panel OR state='published')
);
CREATE INDEX asset_attachments_panel_page ON asset_attachments(issue_id,uploaded_at,id) WHERE in_panel AND state='published';
CREATE INDEX asset_attachments_drafts ON asset_attachments(uploaded_by,issue_id,uploaded_at,id) WHERE state='draft';
CREATE INDEX asset_attachments_expiry ON asset_attachments(expires_at,id) WHERE state='draft';
CREATE VIEW compatible_pictures AS SELECT id,project_id,issue_id,uploaded_by,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel AS in_gallery,uploaded_at,expires_at,published_at FROM asset_attachments WHERE kind='image';
CREATE VIEW compatible_attachments AS SELECT id,project_id,issue_id,uploaded_by,filename,mime_type,byte_size,checksum,staging_key,staging_generation,coalesce(published_key,'') AS published_key,coalesce(published_generation,0)::bigint AS published_generation,in_panel AS attached,uploaded_at FROM asset_attachments WHERE kind='file' AND state='published';
CREATE TABLE asset_upload_reservations (
 actor_id uuid NOT NULL REFERENCES users(id),retry_reference uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('upload_picture','upload_attachment','upload_asset','start_asset_upload')),
 command_hash text NOT NULL CHECK(command_hash ~ '^[0-9a-f]{64}$'),asset_id uuid NOT NULL UNIQUE,
 project_id uuid NOT NULL,issue_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('image','file')),
 staging_key text NOT NULL UNIQUE,staging_generation bigint CHECK(staging_generation>0),
 published_key text,published_generation bigint CHECK(published_generation>0),checksum text CHECK(checksum ~ '^[0-9a-f]{64}$'),
 lease_until timestamptz NOT NULL,state text NOT NULL CHECK(state IN('uploading','ready','failed','committed','canceled','expired')),
 expected_bytes bigint CHECK(expected_bytes>0),maximum_bytes bigint NOT NULL CHECK(maximum_bytes BETWEEN 1 AND 104857600),
 upload_method text NOT NULL DEFAULT 'backend' CHECK(upload_method IN('backend','resumable')),
 upload_expires_at timestamptz NOT NULL,storage_session text,received_bytes bigint NOT NULL DEFAULT 0 CHECK(received_bytes>=0),
 filename text CHECK(char_length(filename) BETWEEN 1 AND 255),description text CHECK(char_length(description)<=200),mime_type text,
 publication text CHECK(publication IN('draft','issue')),last_chunk_hash text CHECK(last_chunk_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,retry_reference),FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id),
 CHECK(expected_bytes IS NULL OR expected_bytes<=maximum_bytes),CHECK(expected_bytes IS NULL OR received_bytes<=expected_bytes),
 CHECK(kind<>'image' OR maximum_bytes<=10485760),
 CHECK(operation IN('upload_picture','upload_attachment') OR (expected_bytes IS NOT NULL AND filename IS NOT NULL AND mime_type IS NOT NULL AND publication IS NOT NULL)),
 CHECK(upload_method='backend' OR expected_bytes IS NOT NULL),
 CHECK(state NOT IN('ready','committed') OR (staging_generation IS NOT NULL AND checksum IS NOT NULL)),
 CHECK((published_key IS NULL)=(published_generation IS NULL))
);
CREATE INDEX asset_upload_cleanup ON asset_upload_reservations(state,upload_expires_at,lease_until,asset_id);
CREATE TABLE comment_version_attachments (
 comment_id uuid NOT NULL,version bigint NOT NULL,issue_id uuid NOT NULL,attachment_id uuid NOT NULL,
 PRIMARY KEY(comment_id,version,attachment_id),
 FOREIGN KEY(comment_id,version,issue_id) REFERENCES comment_versions(comment_id,revision,issue_id),
 FOREIGN KEY(issue_id,attachment_id) REFERENCES asset_attachments(issue_id,id)
);
CREATE INDEX retained_attachment_references ON comment_version_attachments(attachment_id,comment_id,version);
CREATE INDEX legacy_images_expansion ON pictures(project_id,id);
CREATE INDEX legacy_files_expansion ON attachments(project_id,id);
-- +goose StatementBegin
CREATE FUNCTION mirror_canonical_asset_compatibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW;END IF;
 IF NEW.kind='image' THEN
  INSERT INTO pictures(id,project_id,issue_id,uploaded_by,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_gallery,uploaded_at,expires_at,published_at)
  VALUES(NEW.id,NEW.project_id,NEW.issue_id,NEW.uploaded_by,NEW.filename,NEW.description,NEW.mime_type,NEW.byte_size,NEW.checksum,NEW.staging_key,NEW.staging_generation,NEW.published_key,NEW.published_generation,NEW.state,NEW.in_panel,NEW.uploaded_at,NEW.expires_at,NEW.published_at)
  ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,in_gallery=EXCLUDED.in_gallery,published_key=EXCLUDED.published_key,published_generation=EXCLUDED.published_generation,published_at=EXCLUDED.published_at;
 ELSIF NEW.state='published' AND NEW.byte_size<=10485760 THEN
  INSERT INTO attachments(id,project_id,issue_id,uploaded_by,filename,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,attached,uploaded_at)
  VALUES(NEW.id,NEW.project_id,NEW.issue_id,NEW.uploaded_by,NEW.filename,NEW.mime_type,NEW.byte_size,NEW.checksum,NEW.staging_key,NEW.staging_generation,NEW.published_key,NEW.published_generation,NEW.in_panel,NEW.uploaded_at)
  ON CONFLICT(id) DO UPDATE SET attached=EXCLUDED.attached;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION mirror_canonical_reservation_compatibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF pg_trigger_depth()>1 OR NEW.state NOT IN('uploading','ready','failed','committed') THEN RETURN NEW;END IF;
 IF NEW.operation='upload_picture' THEN
  INSERT INTO upload_reservations(actor_id,retry_reference,command_hash,picture_id,project_id,issue_id,staging_key,staging_generation,published_key,published_generation,lease_until,checksum,state,created_at,updated_at)
  VALUES(NEW.actor_id,NEW.retry_reference,NEW.command_hash,NEW.asset_id,NEW.project_id,NEW.issue_id,NEW.staging_key,NEW.staging_generation,NEW.published_key,NEW.published_generation,NEW.lease_until,NEW.checksum,NEW.state,NEW.created_at,NEW.updated_at)
  ON CONFLICT(actor_id,retry_reference) DO UPDATE SET staging_generation=EXCLUDED.staging_generation,published_key=EXCLUDED.published_key,published_generation=EXCLUDED.published_generation,lease_until=EXCLUDED.lease_until,checksum=EXCLUDED.checksum,state=EXCLUDED.state,updated_at=EXCLUDED.updated_at;
 ELSIF NEW.operation='upload_attachment' THEN
  INSERT INTO attachment_upload_reservations(actor_id,retry_reference,command_hash,attachment_id,project_id,issue_id,staging_key,staging_generation,published_key,published_generation,lease_until,checksum,state,created_at,updated_at)
  VALUES(NEW.actor_id,NEW.retry_reference,NEW.command_hash,NEW.asset_id,NEW.project_id,NEW.issue_id,NEW.staging_key,NEW.staging_generation,NEW.published_key,NEW.published_generation,NEW.lease_until,NEW.checksum,NEW.state,NEW.created_at,NEW.updated_at)
  ON CONFLICT(actor_id,retry_reference) DO UPDATE SET staging_generation=EXCLUDED.staging_generation,published_key=EXCLUDED.published_key,published_generation=EXCLUDED.published_generation,lease_until=EXCLUDED.lease_until,checksum=EXCLUDED.checksum,state=EXCLUDED.state,updated_at=EXCLUDED.updated_at;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION preserve_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','in_panel','published_key','published_generation','published_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','in_panel','published_key','published_generation','published_at'])
 OR (OLD.published_key IS NOT NULL AND (NEW.published_key,NEW.published_generation,NEW.published_at) IS DISTINCT FROM (OLD.published_key,OLD.published_generation,OLD.published_at)) THEN
  RAISE EXCEPTION 'asset bytes and attribution are immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION preserve_asset_session_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.actor_id,NEW.retry_reference,NEW.operation,NEW.command_hash,NEW.asset_id,NEW.project_id,NEW.issue_id,NEW.kind,NEW.staging_key,NEW.maximum_bytes,NEW.upload_method,NEW.upload_expires_at,NEW.created_at)
 IS DISTINCT FROM (OLD.actor_id,OLD.retry_reference,OLD.operation,OLD.command_hash,OLD.asset_id,OLD.project_id,OLD.issue_id,OLD.kind,OLD.staging_key,OLD.maximum_bytes,OLD.upload_method,OLD.upload_expires_at,OLD.created_at)
 OR (OLD.expected_bytes IS NOT NULL AND (NEW.expected_bytes,NEW.filename,NEW.description,NEW.mime_type,NEW.publication) IS DISTINCT FROM (OLD.expected_bytes,OLD.filename,OLD.description,OLD.mime_type,OLD.publication)) THEN
  RAISE EXCEPTION 'upload identity and declared content are immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION mirror_legacy_image_asset(p pictures) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 INSERT INTO asset_attachments(id,project_id,issue_id,uploaded_by,kind,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel,uploaded_at,expires_at,published_at) SELECT p.id,p.project_id,p.issue_id,p.uploaded_by,'image',p.filename,p.description,p.mime_type,p.byte_size,p.checksum,p.staging_key,p.staging_generation,p.published_key,p.published_generation,p.state,p.in_gallery,p.uploaded_at,p.expires_at,p.published_at
 ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,in_panel=EXCLUDED.in_panel,published_key=EXCLUDED.published_key,published_generation=EXCLUDED.published_generation,published_at=EXCLUDED.published_at;
$$;
CREATE FUNCTION mirror_legacy_image_asset_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW;END IF;PERFORM mirror_legacy_image_asset(NEW);RETURN NEW;END $$;
CREATE FUNCTION mirror_legacy_file_asset(p attachments) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 INSERT INTO asset_attachments(id,project_id,issue_id,uploaded_by,kind,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel,uploaded_at,expires_at,published_at) SELECT p.id,p.project_id,p.issue_id,p.uploaded_by,'file',p.filename,'',p.mime_type,p.byte_size,p.checksum,p.staging_key,p.staging_generation,p.published_key,p.published_generation,'published',p.attached,p.uploaded_at,NULL,NULL
 ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,in_panel=EXCLUDED.in_panel,published_key=EXCLUDED.published_key,published_generation=EXCLUDED.published_generation,published_at=asset_attachments.published_at;
$$;
CREATE FUNCTION mirror_legacy_file_asset_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW;END IF;PERFORM mirror_legacy_file_asset(NEW);RETURN NEW;END $$;
CREATE FUNCTION mirror_legacy_image_reservation(p upload_reservations) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM asset_upload_reservations r WHERE (r.actor_id,r.retry_reference)=(p.actor_id,p.retry_reference) AND (r.operation,r.command_hash,r.asset_id,r.project_id,r.issue_id) IS DISTINCT FROM ('upload_picture'::text,p.command_hash,p.picture_id,p.project_id,p.issue_id)) THEN
  RAISE EXCEPTION 'legacy upload reference collision' USING ERRCODE='23505';
 END IF;
 INSERT INTO asset_upload_reservations(actor_id,retry_reference,operation,command_hash,asset_id,project_id,issue_id,kind,staging_key,staging_generation,published_key,published_generation,checksum,lease_until,state,expected_bytes,maximum_bytes,upload_method,upload_expires_at,received_bytes,filename,description,mime_type,publication,created_at,updated_at)
 SELECT p.actor_id,p.retry_reference,'upload_picture',p.command_hash,p.picture_id,p.project_id,p.issue_id,'image',p.staging_key,p.staging_generation,p.published_key,p.published_generation,p.checksum,p.lease_until,p.state,a.byte_size,10485760,'backend',p.created_at+interval '24 hours',CASE WHEN p.state='committed' THEN coalesce(a.byte_size,0) ELSE 0 END,a.filename,a.description,a.mime_type,CASE WHEN a.state='draft' THEN 'draft' WHEN a.state='published' THEN 'issue' ELSE NULL END,p.created_at,p.updated_at
 FROM (SELECT 1) seed LEFT JOIN asset_attachments a ON a.id=p.picture_id
 ON CONFLICT(actor_id,retry_reference) DO UPDATE SET staging_generation=EXCLUDED.staging_generation,published_key=EXCLUDED.published_key,published_generation=EXCLUDED.published_generation,checksum=EXCLUDED.checksum,lease_until=EXCLUDED.lease_until,state=EXCLUDED.state,updated_at=EXCLUDED.updated_at,
 expected_bytes=coalesce(asset_upload_reservations.expected_bytes,EXCLUDED.expected_bytes),received_bytes=greatest(asset_upload_reservations.received_bytes,EXCLUDED.received_bytes),filename=coalesce(asset_upload_reservations.filename,EXCLUDED.filename),description=coalesce(asset_upload_reservations.description,EXCLUDED.description),mime_type=coalesce(asset_upload_reservations.mime_type,EXCLUDED.mime_type),publication=coalesce(asset_upload_reservations.publication,EXCLUDED.publication);
END $$;
CREATE FUNCTION mirror_legacy_image_reservation_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW;END IF;PERFORM mirror_legacy_image_reservation(NEW);RETURN NEW;END $$;
CREATE FUNCTION mirror_legacy_file_reservation(p attachment_upload_reservations) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM asset_upload_reservations r WHERE (r.actor_id,r.retry_reference)=(p.actor_id,p.retry_reference) AND (r.operation,r.command_hash,r.asset_id,r.project_id,r.issue_id) IS DISTINCT FROM ('upload_attachment'::text,p.command_hash,p.attachment_id,p.project_id,p.issue_id)) THEN
  RAISE EXCEPTION 'legacy upload reference collision' USING ERRCODE='23505';
 END IF;
 INSERT INTO asset_upload_reservations(actor_id,retry_reference,operation,command_hash,asset_id,project_id,issue_id,kind,staging_key,staging_generation,published_key,published_generation,checksum,lease_until,state,expected_bytes,maximum_bytes,upload_method,upload_expires_at,received_bytes,filename,description,mime_type,publication,created_at,updated_at)
 SELECT p.actor_id,p.retry_reference,'upload_attachment',p.command_hash,p.attachment_id,p.project_id,p.issue_id,'file',p.staging_key,p.staging_generation,p.published_key,p.published_generation,p.checksum,p.lease_until,p.state,a.byte_size,10485760,'backend',p.created_at+interval '24 hours',CASE WHEN p.state='committed' THEN coalesce(a.byte_size,0) ELSE 0 END,a.filename,a.description,a.mime_type,CASE WHEN a.state='draft' THEN 'draft' WHEN a.state='published' THEN 'issue' ELSE NULL END,p.created_at,p.updated_at
 FROM (SELECT 1) seed LEFT JOIN asset_attachments a ON a.id=p.attachment_id
 ON CONFLICT(actor_id,retry_reference) DO UPDATE SET staging_generation=EXCLUDED.staging_generation,published_key=EXCLUDED.published_key,published_generation=EXCLUDED.published_generation,checksum=EXCLUDED.checksum,lease_until=EXCLUDED.lease_until,state=EXCLUDED.state,updated_at=EXCLUDED.updated_at,
 expected_bytes=coalesce(asset_upload_reservations.expected_bytes,EXCLUDED.expected_bytes),received_bytes=greatest(asset_upload_reservations.received_bytes,EXCLUDED.received_bytes),filename=coalesce(asset_upload_reservations.filename,EXCLUDED.filename),description=coalesce(asset_upload_reservations.description,EXCLUDED.description),mime_type=coalesce(asset_upload_reservations.mime_type,EXCLUDED.mime_type),publication=coalesce(asset_upload_reservations.publication,EXCLUDED.publication);
END $$;
CREATE FUNCTION mirror_legacy_file_reservation_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW;END IF;PERFORM mirror_legacy_file_reservation(NEW);RETURN NEW;END $$;
CREATE FUNCTION mirror_legacy_comment_asset_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 INSERT INTO comment_version_attachments(comment_id,version,issue_id,attachment_id) VALUES(NEW.comment_id,NEW.version,NEW.issue_id,NEW.picture_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE FUNCTION backfill_legacy_assets(p_limit integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE target uuid;affected integer:=0;source pictures;file_source attachments;
BEGIN
 IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'asset batch must be 1-1000';END IF;
 PERFORM singleton FROM company_settings WHERE singleton FOR SHARE;
 SELECT project_id INTO target FROM (
 SELECT p.project_id FROM pictures p WHERE NOT EXISTS(SELECT 1 FROM asset_attachments a WHERE a.id=p.id)
 UNION SELECT p.project_id FROM attachments p WHERE NOT EXISTS(SELECT 1 FROM asset_attachments a WHERE a.id=p.id)
 ) missing ORDER BY project_id LIMIT 1;
 IF target IS NULL THEN RETURN 0;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||target::text,0));
 PERFORM id FROM projects WHERE id=target FOR UPDATE;
 FOR source IN SELECT p.* FROM pictures p WHERE p.project_id=target AND NOT EXISTS(SELECT 1 FROM asset_attachments a WHERE a.id=p.id) ORDER BY p.id LIMIT p_limit LOOP
  PERFORM mirror_legacy_image_asset(source);affected:=affected+1;
 END LOOP;
 IF affected<p_limit THEN
  FOR file_source IN SELECT p.* FROM attachments p WHERE p.project_id=target AND NOT EXISTS(SELECT 1 FROM asset_attachments a WHERE a.id=p.id) ORDER BY p.id LIMIT p_limit-affected LOOP
   PERFORM mirror_legacy_file_asset(file_source);affected:=affected+1;
  END LOOP;
 END IF;
 RETURN greatest(affected,1);
END $$;
CREATE FUNCTION backfill_legacy_asset_reservations(p_limit integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE target uuid;affected integer:=0;source upload_reservations;file_source attachment_upload_reservations;
BEGIN
 IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'reservation batch must be 1-1000';END IF;
 PERFORM singleton FROM company_settings WHERE singleton FOR SHARE;
 SELECT project_id INTO target FROM (
 SELECT r.project_id FROM upload_reservations r WHERE NOT EXISTS(SELECT 1 FROM asset_upload_reservations a WHERE (a.actor_id,a.retry_reference)=(r.actor_id,r.retry_reference))
 UNION SELECT r.project_id FROM attachment_upload_reservations r WHERE NOT EXISTS(SELECT 1 FROM asset_upload_reservations a WHERE (a.actor_id,a.retry_reference)=(r.actor_id,r.retry_reference))
 ) missing ORDER BY project_id LIMIT 1;
 IF target IS NULL THEN RETURN 0;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||target::text,0));
 PERFORM id FROM projects WHERE id=target FOR UPDATE;
 FOR source IN SELECT r.* FROM upload_reservations r WHERE r.project_id=target AND NOT EXISTS(SELECT 1 FROM asset_upload_reservations a WHERE (a.actor_id,a.retry_reference)=(r.actor_id,r.retry_reference)) ORDER BY r.actor_id,r.retry_reference LIMIT p_limit LOOP
  PERFORM mirror_legacy_image_reservation(source);affected:=affected+1;
 END LOOP;
 IF affected<p_limit THEN
  FOR file_source IN SELECT r.* FROM attachment_upload_reservations r WHERE r.project_id=target AND NOT EXISTS(SELECT 1 FROM asset_upload_reservations a WHERE (a.actor_id,a.retry_reference)=(r.actor_id,r.retry_reference)) ORDER BY r.actor_id,r.retry_reference LIMIT p_limit-affected LOOP
   PERFORM mirror_legacy_file_reservation(file_source);affected:=affected+1;
  END LOOP;
 END IF;
 RETURN greatest(affected,1);
END $$;
-- +goose StatementEnd
CREATE TRIGGER canonical_asset_compatibility AFTER INSERT OR UPDATE ON asset_attachments FOR EACH ROW EXECUTE FUNCTION mirror_canonical_asset_compatibility();
CREATE TRIGGER canonical_reservation_compatibility AFTER INSERT OR UPDATE ON asset_upload_reservations FOR EACH ROW EXECUTE FUNCTION mirror_canonical_reservation_compatibility();
CREATE TRIGGER assets_immutable BEFORE UPDATE ON asset_attachments FOR EACH ROW EXECUTE FUNCTION preserve_asset_identity();
CREATE TRIGGER assets_retained BEFORE DELETE ON asset_attachments FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER asset_session_identity BEFORE UPDATE ON asset_upload_reservations FOR EACH ROW EXECUTE FUNCTION preserve_asset_session_identity();
CREATE TRIGGER legacy_image_asset AFTER INSERT OR UPDATE ON pictures FOR EACH ROW EXECUTE FUNCTION mirror_legacy_image_asset_trigger();
CREATE TRIGGER legacy_file_asset AFTER INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION mirror_legacy_file_asset_trigger();
CREATE TRIGGER legacy_image_reservation AFTER INSERT OR UPDATE ON upload_reservations FOR EACH ROW EXECUTE FUNCTION mirror_legacy_image_reservation_trigger();
CREATE TRIGGER legacy_file_reservation AFTER INSERT OR UPDATE ON attachment_upload_reservations FOR EACH ROW EXECUTE FUNCTION mirror_legacy_file_reservation_trigger();
CREATE TRIGGER legacy_comment_asset_reference AFTER INSERT ON comment_version_pictures FOR EACH ROW EXECUTE FUNCTION mirror_legacy_comment_asset_reference();
REVOKE ALL ON FUNCTION mirror_legacy_image_asset(pictures),mirror_legacy_file_asset(attachments),mirror_legacy_image_reservation(upload_reservations),mirror_legacy_file_reservation(attachment_upload_reservations),mirror_legacy_comment_asset_reference(),backfill_legacy_assets(integer),backfill_legacy_asset_reservations(integer) FROM PUBLIC;
-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Asset expansion requires a verified forward repair or full source/database restore';END $$;
-- +goose StatementEnd
