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

-- Summaries table (updated with missing columns)
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary_text TEXT,
  transcript_text TEXT NOT NULL,
  transcript_json JSONB NOT NULL,
  meeting_metadata JSONB,
  meeting_duration_minutes INTEGER, -- Added missing column
  summary_status TEXT NOT NULL DEFAULT 'pending', -- Moved here from ALTER at bottom
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

-- Products table for credit packages
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL, -- in cents
  credits INTEGER NOT NULL,
  active BOOLEAN DEFAULT true
);

-- Orders table to track purchases
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  amount INTEGER NOT NULL, -- in cents
  payment_status TEXT NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_summaries_user_id ON summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_summaries_duration ON summaries(meeting_duration_minutes); -- New index for duration queries
CREATE INDEX IF NOT EXISTS idx_summaries_status ON summaries(summary_status); -- New index for status queries
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON credit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_logs_timestamp ON credit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_id ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_summaries_transcript ON summaries USING gin (transcript_json);

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

-- Insert initial products
INSERT INTO products (id, name, price, credits)
VALUES 
  ('credit_100', 'Starter Pack', 999, 25),
  ('credit_500', 'Professional Pack', 2499, 75),
  ('credit_1000', 'Business Pack', 4999, 175)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  credits = EXCLUDED.credits,
  active = EXCLUDED.active;

-- Initial admin user
INSERT INTO users (name, email, supabase_id, credits)
VALUES ('Admin User', 'admin@example.com', '00000000-0000-0000-0000-000000000000', 1000)
ON CONFLICT (email) DO NOTHING;

-- Migration script for existing installations
-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add meeting_duration_minutes column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'summaries' 
        AND column_name = 'meeting_duration_minutes'
    ) THEN
        ALTER TABLE summaries ADD COLUMN meeting_duration_minutes INTEGER;
    END IF;
    
    -- Add summary_status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'summaries' 
        AND column_name = 'summary_status'
    ) THEN
        ALTER TABLE summaries ADD COLUMN summary_status TEXT NOT NULL DEFAULT 'pending';
    END IF;
END $$;