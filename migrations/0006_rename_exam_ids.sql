-- Migration 0006: Rename exam IDs to official Salesforce certification names
-- and fix display names for all exams (separate JA/EN names)

-- Step 1: Insert new exam rows with correct JA/EN names
INSERT OR IGNORE INTO exams (id, name, lang) VALUES
  ('mulesoft_developer_exam',                          'Salesforce 認定 MuleSoft デベロッパー',                      'ja'),
  ('mulesoft_developer_exam_en',                       'Salesforce Certified MuleSoft Developer',                    'en'),
  ('mulesoft_platform_integration_architect_exam',     'Salesforce 認定 MuleSoft Platform Integration アーキテクト', 'ja'),
  ('mulesoft_platform_integration_architect_exam_en',  'Salesforce Certified MuleSoft Platform Integration Architect','en');

-- Step 2: Migrate questions for mule_dev_201_exam → mulesoft_developer_exam
UPDATE questions
  SET id = REPLACE(id, 'mule_dev_201_exam__', 'mulesoft_developer_exam__'),
      exam_id = 'mulesoft_developer_exam'
  WHERE exam_id = 'mule_dev_201_exam';

UPDATE questions
  SET id = REPLACE(id, 'mule_dev_201_exam_en__', 'mulesoft_developer_exam_en__'),
      exam_id = 'mulesoft_developer_exam_en'
  WHERE exam_id = 'mule_dev_201_exam_en';

-- Step 3: Migrate questions for plat_arch_202_exam → mulesoft_platform_integration_architect_exam
UPDATE questions
  SET id = REPLACE(id, 'plat_arch_202_exam__', 'mulesoft_platform_integration_architect_exam__'),
      exam_id = 'mulesoft_platform_integration_architect_exam'
  WHERE exam_id = 'plat_arch_202_exam';

UPDATE questions
  SET id = REPLACE(id, 'plat_arch_202_exam_en__', 'mulesoft_platform_integration_architect_exam_en__'),
      exam_id = 'mulesoft_platform_integration_architect_exam_en'
  WHERE exam_id = 'plat_arch_202_exam_en';

-- Step 4: Update question_history.question_id
UPDATE question_history
  SET question_id = REPLACE(question_id, 'mule_dev_201_exam__', 'mulesoft_developer_exam__')
  WHERE question_id LIKE 'mule_dev_201_exam__%';

UPDATE question_history
  SET question_id = REPLACE(question_id, 'mule_dev_201_exam_en__', 'mulesoft_developer_exam_en__')
  WHERE question_id LIKE 'mule_dev_201_exam_en__%';

UPDATE question_history
  SET question_id = REPLACE(question_id, 'plat_arch_202_exam__', 'mulesoft_platform_integration_architect_exam__')
  WHERE question_id LIKE 'plat_arch_202_exam__%';

UPDATE question_history
  SET question_id = REPLACE(question_id, 'plat_arch_202_exam_en__', 'mulesoft_platform_integration_architect_exam_en__')
  WHERE question_id LIKE 'plat_arch_202_exam_en__%';

-- Step 5: Update scores.question_id
UPDATE scores
  SET question_id = REPLACE(question_id, 'mule_dev_201_exam__', 'mulesoft_developer_exam__')
  WHERE question_id LIKE 'mule_dev_201_exam__%';

UPDATE scores
  SET question_id = REPLACE(question_id, 'mule_dev_201_exam_en__', 'mulesoft_developer_exam_en__')
  WHERE question_id LIKE 'mule_dev_201_exam_en__%';

UPDATE scores
  SET question_id = REPLACE(question_id, 'plat_arch_202_exam__', 'mulesoft_platform_integration_architect_exam__')
  WHERE question_id LIKE 'plat_arch_202_exam__%';

UPDATE scores
  SET question_id = REPLACE(question_id, 'plat_arch_202_exam_en__', 'mulesoft_platform_integration_architect_exam_en__')
  WHERE question_id LIKE 'plat_arch_202_exam_en__%';

-- Step 6: Delete old exam rows
DELETE FROM exams WHERE id IN (
  'mule_dev_201_exam',
  'mule_dev_201_exam_en',
  'plat_arch_202_exam',
  'plat_arch_202_exam_en'
);

-- Step 7: Fix display names for remaining exams (JA/EN separately)
UPDATE exams SET name = 'Salesforce 認定 Experience Cloud コンサルタント'                    WHERE id = 'experience_cloud_consultant_exam';
UPDATE exams SET name = 'Salesforce Certified Experience Cloud Consultant'                  WHERE id = 'experience_cloud_consultant_exam_en';
UPDATE exams SET name = 'Salesforce 認定 Platform Identity and Access Management アーキテクト' WHERE id = 'platform_iam_architect_exam';
UPDATE exams SET name = 'Salesforce Certified Platform Identity and Access Management Architect' WHERE id = 'platform_iam_architect_exam_en';
UPDATE exams SET name = 'Salesforce 認定 User Experience (UX) デザイナー'                    WHERE id = 'ux_designer_exam';
UPDATE exams SET name = 'Salesforce Certified Platform User Experience Designer'            WHERE id = 'ux_designer_exam_en';
UPDATE exams SET name = 'Salesforce 認定 Service Cloud コンサルタント'                       WHERE id = 'service_cloud_consultant_exam';
UPDATE exams SET name = 'Salesforce Certified Service Cloud Consultant'                     WHERE id = 'service_cloud_consultant_exam_en';
