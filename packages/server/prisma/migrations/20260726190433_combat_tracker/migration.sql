-- CreateTable
CREATE TABLE "Combat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 0,
    "activeCombatantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Combat_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Combatant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "combatId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "initiative" INTEGER,
    "tieBreak" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Combatant_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "Combat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Combatant_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Combat_sceneId_key" ON "Combat"("sceneId");

-- CreateIndex
CREATE INDEX "Combatant_combatId_idx" ON "Combatant"("combatId");

-- CreateIndex
CREATE UNIQUE INDEX "Combatant_combatId_tokenId_key" ON "Combatant"("combatId", "tokenId");
