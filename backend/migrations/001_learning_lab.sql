CREATE TABLE IF NOT EXISTS rubric_versions(
  code TEXT PRIMARY KEY,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_versions(
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS research_articles(
  job_id UUID PRIMARY KEY REFERENCES review_jobs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  article_hash TEXT NOT NULL,
  article_text TEXT NOT NULL,
  rubric_version TEXT NOT NULL REFERENCES rubric_versions(code),
  legacy_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_research_articles_hash ON research_articles(article_hash);

CREATE TABLE IF NOT EXISTS learning_predictions(
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES review_jobs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_model TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT '',
  rubric_version TEXT NOT NULL REFERENCES rubric_versions(code),
  model_version TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id,source,source_model,lane)
);
CREATE INDEX IF NOT EXISTS idx_learning_predictions_job ON learning_predictions(job_id,source);

CREATE TABLE IF NOT EXISTS human_validations(
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES review_jobs(id) ON DELETE CASCADE,
  microcriterion_id TEXT NOT NULL,
  final_status TEXT NOT NULL CHECK(final_status IN ('Cumple','Parcial alto','Parcial','Parcial bajo','No cumple')),
  evidence TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  validator TEXT NOT NULL DEFAULT 'Investigador',
  rubric_version TEXT NOT NULL REFERENCES rubric_versions(code),
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id,microcriterion_id)
);
CREATE INDEX IF NOT EXISTS idx_human_validations_job ON human_validations(job_id);

CREATE TABLE IF NOT EXISTS training_examples(
  id UUID PRIMARY KEY,
  validation_id UUID NOT NULL UNIQUE REFERENCES human_validations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES review_jobs(id) ON DELETE CASCADE,
  microcriterion_id TEXT NOT NULL,
  article_excerpt TEXT NOT NULL DEFAULT '',
  target JSONB NOT NULL,
  rubric_version TEXT NOT NULL REFERENCES rubric_versions(code),
  status TEXT NOT NULL DEFAULT 'validated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_examples_micro ON training_examples(microcriterion_id,created_at DESC);
