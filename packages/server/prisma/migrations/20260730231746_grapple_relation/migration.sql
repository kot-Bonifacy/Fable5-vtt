-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Combatant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "combatId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "initiative" INTEGER,
    "tieBreak" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "turnState" TEXT,
    "heldTrigger" TEXT,
    "heldInitiative" INTEGER,
    "held" BOOLEAN NOT NULL DEFAULT false,
    "actionBypass" BOOLEAN NOT NULL DEFAULT false,
    "grappledById" TEXT,
    "chokeStreak" INTEGER NOT NULL DEFAULT 0,
    "chokeRound" INTEGER,
    "humanShield" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Combatant_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "Combat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Combatant_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Combatant" ("actionBypass", "combatId", "createdAt", "held", "heldInitiative", "heldTrigger", "id", "initiative", "order", "tieBreak", "tokenId", "turnState") SELECT "actionBypass", "combatId", "createdAt", "held", "heldInitiative", "heldTrigger", "id", "initiative", "order", "tieBreak", "tokenId", "turnState" FROM "Combatant";
DROP TABLE "Combatant";
ALTER TABLE "new_Combatant" RENAME TO "Combatant";
CREATE INDEX "Combatant_combatId_idx" ON "Combatant"("combatId");
CREATE UNIQUE INDEX "Combatant_combatId_tokenId_key" ON "Combatant"("combatId", "tokenId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
