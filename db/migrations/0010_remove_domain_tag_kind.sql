DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tags WHERE kind = 'domain') THEN
    RAISE EXCEPTION 'Cannot remove domain from tag_kind: domain rows still exist in tags';
  END IF;
END $$;

CREATE TYPE tag_kind_new AS ENUM ('topic', 'substance', 'treatment', 'diagnosis');

ALTER TABLE tags
  ALTER COLUMN kind TYPE tag_kind_new
  USING kind::text::tag_kind_new;

DROP TYPE tag_kind;

ALTER TYPE tag_kind_new RENAME TO tag_kind;
