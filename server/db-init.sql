-- SQL to create the products table for Product Hunt Finder backend

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  publishedAt TIMESTAMP,
  phLink TEXT,
  makerName TEXT,
  status TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  linkedin TEXT,
  upvotes INTEGER,
  phVotes INTEGER,
  phDayRank INTEGER,
  phTopics JSONB,
  companyWebsite TEXT,
  companyInfo TEXT,
  launchDate TEXT,
  accelerator TEXT,
  phGithub TEXT,
  phEnrichedAt TIMESTAMP,
  approvedAt TIMESTAMP,
  syncedToSheets BOOLEAN,
  syncedToSheetsAt TIMESTAMP,
  thumbnail JSONB
);
