-- AI calls logged before calls carried their process: take it from the interview they belong to.
UPDATE "llm_calls" AS c
SET "process_id" = s."process_id"
FROM "interview_sessions" AS s
WHERE c."session_id" = s."id" AND c."process_id" IS NULL;
