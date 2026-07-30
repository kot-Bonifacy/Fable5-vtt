-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Wall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sceneId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'wall',
    "open" BOOLEAN NOT NULL DEFAULT false,
    "playerToggle" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "x1" REAL NOT NULL,
    "y1" REAL NOT NULL,
    "x2" REAL NOT NULL,
    "y2" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wall_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Wall" ("createdAt", "id", "kind", "open", "playerToggle", "sceneId", "x1", "x2", "y1", "y2") SELECT "createdAt", "id", "kind", "open", "playerToggle", "sceneId", "x1", "x2", "y1", "y2" FROM "Wall";
DROP TABLE "Wall";
ALTER TABLE "new_Wall" RENAME TO "Wall";
CREATE INDEX "Wall_sceneId_idx" ON "Wall"("sceneId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
