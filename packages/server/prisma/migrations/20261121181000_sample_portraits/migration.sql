-- Sample portraits (MG 21.11.2026): has this campaign's pool already got the
-- set? Existing campaigns start at false and get it once at server start.
ALTER TABLE "Campaign" ADD COLUMN "samplePortraitsSeeded" BOOLEAN NOT NULL DEFAULT false;
