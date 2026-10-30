-- 30.10.2026: przełącznik sceny „Gracze dzielą się widokiem” (domyślnie wyłączony,
-- także na scenach sprzed zmiany) i pamięć mapy osobno dla każdego gracza.

-- AlterTable
ALTER TABLE "Scene" ADD COLUMN "partySight" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlayerExploration" (
    "sceneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cell" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("sceneId", "userId"),
    CONSTRAINT "PlayerExploration_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerExploration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlayerExploration_userId_idx" ON "PlayerExploration"("userId");

-- Każdy gracz kampanii dostaje kopię dotychczasowej pamięci drużyny: to, co znał
-- przy wspólnym widoku, nie znika mu z planu po wyłączeniu go na scenie.
INSERT INTO "PlayerExploration" ("sceneId", "userId", "cell", "cols", "rows", "data", "updatedAt")
SELECT e."sceneId", m."userId", e."cell", e."cols", e."rows", e."data", e."updatedAt"
FROM "SceneExploration" e
JOIN "Scene" s ON s."id" = e."sceneId"
JOIN "CampaignMember" m ON m."campaignId" = s."campaignId";
