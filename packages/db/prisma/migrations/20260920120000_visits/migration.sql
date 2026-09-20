-- Groups dish logs into visits: one trip to one restaurant on one day.
-- Hand-written because it backfills data before dropping "Rating"."photoPath"
-- (prisma migrate dev refuses data-loss changes non-interactively).

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "visitedAt" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitPhoto" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "ratingId" TEXT,
    "path" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitPhoto_pkey" PRIMARY KEY ("id")
);

-- AlterTable: nullable for now, made NOT NULL once every log has a visit
ALTER TABLE "Rating" ADD COLUMN "visitId" TEXT;

-- Backfill: every existing log becomes part of a visit, grouped by who logged
-- it, where, and on what day. Ids are UUIDs rather than cuids, as in the
-- restaurant and dish imports — nothing depends on the id format.
WITH "groups" AS (
    SELECT
        gen_random_uuid()::text AS "id",
        r."userId",
        m."restaurantId",
        r."visitedAt",
        MIN(r."createdAt") AS "createdAt"
    FROM "Rating" r
    JOIN "MenuItem" m ON m."id" = r."menuItemId"
    GROUP BY r."userId", m."restaurantId", r."visitedAt"
)
INSERT INTO "Visit" ("id", "userId", "restaurantId", "visitedAt", "note", "createdAt", "updatedAt")
SELECT "id", "userId", "restaurantId", "visitedAt", NULL, "createdAt", "createdAt" FROM "groups";

UPDATE "Rating" r
SET "visitId" = v."id"
FROM "MenuItem" m, "Visit" v
WHERE m."id" = r."menuItemId"
  AND v."userId" = r."userId"
  AND v."restaurantId" = m."restaurantId"
  AND v."visitedAt" = r."visitedAt";

-- Existing photos become visit photos still pointing at the dish they were of
INSERT INTO "VisitPhoto" ("id", "visitId", "ratingId", "path", "position", "createdAt")
SELECT gen_random_uuid()::text, r."visitId", r."id", r."photoPath", 0, r."createdAt"
FROM "Rating" r
WHERE r."photoPath" IS NOT NULL AND r."visitId" IS NOT NULL;

ALTER TABLE "Rating" ALTER COLUMN "visitId" SET NOT NULL;

-- DropColumn: photos now hang off the visit
ALTER TABLE "Rating" DROP COLUMN "photoPath";

-- CreateIndex
CREATE INDEX "Visit_userId_visitedAt_idx" ON "Visit"("userId", "visitedAt");

-- CreateIndex
CREATE INDEX "Visit_restaurantId_visitedAt_idx" ON "Visit"("restaurantId", "visitedAt");

-- CreateIndex
CREATE INDEX "Visit_createdAt_idx" ON "Visit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisitPhoto_path_key" ON "VisitPhoto"("path");

-- CreateIndex
CREATE INDEX "VisitPhoto_visitId_position_idx" ON "VisitPhoto"("visitId", "position");

-- CreateIndex
CREATE INDEX "VisitPhoto_ratingId_idx" ON "VisitPhoto"("ratingId");

-- CreateIndex
CREATE INDEX "Rating_visitId_idx" ON "Rating"("visitId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "Rating"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
