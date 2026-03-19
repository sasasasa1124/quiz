-- Clerk now manages authentication. Drop the custom auth tables.
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS users;
