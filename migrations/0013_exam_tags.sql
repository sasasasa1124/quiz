-- Add tags column to exams table (JSON array of strings, default Salesforce)
ALTER TABLE exams ADD COLUMN tags TEXT DEFAULT '["Salesforce"]';
