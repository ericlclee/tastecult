-- Dishes can belong to several cuisines, all equal (no primary), and a log can
-- record an optional cuisine. Generated with `prisma migrate diff`, then
-- reordered by hand so existing cuisines are copied before the column is dropped.

-- CreateTable
CREATE TABLE "DishCuisine" (
    "dishId" TEXT NOT NULL,
    "cuisineId" TEXT NOT NULL,

    CONSTRAINT "DishCuisine_pkey" PRIMARY KEY ("dishId","cuisineId")
);

-- CreateIndex
CREATE INDEX "DishCuisine_cuisineId_idx" ON "DishCuisine"("cuisineId");

-- AddForeignKey
ALTER TABLE "DishCuisine" ADD CONSTRAINT "DishCuisine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishCuisine" ADD CONSTRAINT "DishCuisine_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added: carry each dish's existing cuisine into the link table before the
-- column is dropped, so no environment loses data.
INSERT INTO "DishCuisine" ("dishId", "cuisineId")
SELECT "id", "cuisineId" FROM "Dish";

-- DropForeignKey
ALTER TABLE "Dish" DROP CONSTRAINT "Dish_cuisineId_fkey";

-- DropIndex
DROP INDEX "Dish_cuisineId_idx";

-- AlterTable
ALTER TABLE "Dish" DROP COLUMN "cuisineId";

-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "cuisineId" TEXT;

-- CreateIndex
CREATE INDEX "Rating_cuisineId_idx" ON "Rating"("cuisineId");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
