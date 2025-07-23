-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  supabase_id UUID UNIQUE NOT NULL,
  credits INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Summaries table
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  transcript_text TEXT NOT NULL,
  transcript_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit logs table
CREATE TABLE IF NOT EXISTS credit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_summaries_user_id ON summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON credit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_logs_timestamp ON credit_logs(timestamp);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;   
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE OR REPLACE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_summaries_updated_at
BEFORE UPDATE ON summaries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle credit updates
CREATE OR REPLACE FUNCTION update_user_credits()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user's credit balance
    UPDATE users 
    SET credits = credits + NEW.change,
        updated_at = NOW()
    WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update user credits when a new log is added
CREATE OR REPLACE TRIGGER trigger_update_user_credits
AFTER INSERT ON credit_logs
FOR EACH ROW EXECUTE FUNCTION update_user_credits();

-- Initial admin user (replace with actual credentials in production)
-- Note: You'll need to replace '00000000-0000-0000-0000-000000000000' with actual Supabase ID
INSERT INTO users (name, email, supabase_id, credits)
VALUES ('Admin User', 'admin@example.com', '00000000-0000-0000-0000-000000000000', 1000)
ON CONFLICT (email) DO NOTHING;
