-- Fix user_snapshots.ts column: INTEGER overflows for millisecond timestamps (max 2147483647)
-- Millisecond epochs in 2026 are ~1775000000000 which exceeds INTEGER range.
ALTER TABLE "user_snapshots" ALTER COLUMN "ts" TYPE bigint;
