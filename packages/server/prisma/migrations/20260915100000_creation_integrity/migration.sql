ALTER TABLE "Character" ADD COLUMN "creationDraftId" TEXT;
ALTER TABLE "Character" ADD COLUMN "creationUserId" TEXT;
ALTER TABLE "Character" ADD COLUMN "creationTokenDone" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Character_creationDraftId_key" ON "Character"("creationDraftId");
ALTER TABLE "CharacterDraft" ADD COLUMN "statRankId" TEXT;
ALTER TABLE "CharacterDraft" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CharacterDraft" ADD COLUMN "lastPatchId" TEXT;
