-- SLM Business Service Layer - Training Feedback Schema
-- Author: Partha Chandramohan
-- Description: Schema for human-in-the-loop training system

-- Query Training History
-- Stores all query executions during training mode for human feedback
CREATE TABLE IF NOT EXISTS query_training_history (
  training_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_request TEXT NOT NULL,
  classified_intent JSONB,
  generated_sql TEXT,
  execution_result JSONB,
  execution_error TEXT,
  validation_score DECIMAL(3,2),
  model_used VARCHAR(50),
  model_attempt INTEGER,  -- Which model in fallback chain
  total_models_attempted INTEGER,
  fallback_chain TEXT,  -- e.g., "codegemma:2b (0.65 ✗), phi3:mini (0.72 ✓)"
  
  -- Human feedback
  human_rating INTEGER CHECK (human_rating >= 1 AND human_rating <= 10),
  human_feedback TEXT,
  improved_sql TEXT,  -- Human-corrected SQL
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  rated_at TIMESTAMP,
  rated_by VARCHAR(100),
  user_role VARCHAR(50),
  
  -- Tracking
  was_successful BOOLEAN DEFAULT FALSE,
  used_for_training BOOLEAN DEFAULT FALSE
);

-- Training Improvements
-- Stores learned patterns and improvements from human feedback
CREATE TABLE IF NOT EXISTS training_improvements (
  improvement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_pattern VARCHAR(255) NOT NULL,  -- e.g., "list_pending_orders"
  error_type VARCHAR(100),              -- e.g., "missing_join", "wrong_filter"
  
  -- Prompt improvements
  original_prompt_fragment TEXT,
  improved_prompt_fragment TEXT NOT NULL,
  
  -- Effectiveness tracking
  average_rating_before DECIMAL(3,2),
  average_rating_after DECIMAL(3,2),
  application_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  
  -- Source tracking
  source_training_ids UUID[],  -- Training queries that led to this improvement
  created_by VARCHAR(100),
  approved_by VARCHAR(100),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  last_applied TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Constraints
  CONSTRAINT unique_pattern_error UNIQUE (query_pattern, error_type)
);

-- Training Metadata
-- Tracks training mode status and overall metrics
CREATE TABLE IF NOT EXISTS training_metadata (
  id SERIAL PRIMARY KEY,
  training_mode_enabled BOOLEAN DEFAULT FALSE,
  enabled_at TIMESTAMP,
  enabled_by VARCHAR(100),
  disabled_at TIMESTAMP,
  disabled_by VARCHAR(100),
  total_queries_collected INTEGER DEFAULT 0,
  total_queries_rated INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert initial training metadata row
INSERT INTO training_metadata (training_mode_enabled, updated_at)
VALUES (FALSE, NOW())
ON CONFLICT DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_rating ON query_training_history(human_rating);
CREATE INDEX IF NOT EXISTS idx_training_created_at ON query_training_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_model ON query_training_history(model_used);
CREATE INDEX IF NOT EXISTS idx_training_pattern ON training_improvements(query_pattern);
CREATE INDEX IF NOT EXISTS idx_training_active ON training_improvements(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_training_request ON query_training_history USING gin(to_tsvector('english', user_request));

-- View: High-rated queries for learning
CREATE OR REPLACE VIEW high_rated_queries AS
SELECT 
  training_id,
  user_request,
  generated_sql,
  improved_sql,
  human_rating,
  model_used,
  validation_score,
  created_at
FROM query_training_history
WHERE human_rating >= 8
  AND was_successful = TRUE
ORDER BY human_rating DESC, created_at DESC;

-- View: Low-rated queries needing improvement
CREATE OR REPLACE VIEW queries_need_improvement AS
SELECT 
  training_id,
  user_request,
  generated_sql,
  execution_error,
  human_rating,
  human_feedback,
  model_used,
  created_at
FROM query_training_history
WHERE human_rating <= 5
  AND used_for_training = FALSE
ORDER BY human_rating ASC, created_at DESC;

-- View: Training analytics summary
CREATE OR REPLACE VIEW training_analytics_summary AS
SELECT 
  COUNT(*) as total_queries,
  COUNT(CASE WHEN human_rating IS NOT NULL THEN 1 END) as rated_queries,
  ROUND(AVG(human_rating), 2) as average_rating,
  COUNT(CASE WHEN human_rating >= 8 THEN 1 END) as high_quality_count,
  COUNT(CASE WHEN human_rating <= 5 THEN 1 END) as low_quality_count,
  COUNT(CASE WHEN improved_sql IS NOT NULL THEN 1 END) as corrections_provided,
  COUNT(DISTINCT model_used) as models_used,
  MAX(created_at) as last_query_time
FROM query_training_history;

-- Comments
COMMENT ON TABLE query_training_history IS 'Stores all query executions during training mode with human feedback';
COMMENT ON TABLE training_improvements IS 'Learned improvements extracted from human feedback';
COMMENT ON TABLE training_metadata IS 'Global training mode status and metrics';
COMMENT ON COLUMN query_training_history.fallback_chain IS 'Shows which models were tried and their scores';
COMMENT ON COLUMN training_improvements.improved_prompt_fragment IS 'Prompt enhancement to inject based on learned pattern';

