/*
  Warnings:

  - Added the required column `macroRegion` to the `Cuisine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `region` to the `Cuisine` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Cuisine" ADD COLUMN     "macroRegion" TEXT NOT NULL,
ADD COLUMN     "region" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Dish" ADD COLUMN     "category" TEXT,
ADD COLUMN     "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "otherNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "popularity" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Dish_parentId_idx" ON "Dish"("parentId");

-- CreateIndex
CREATE INDEX "Dish_popularity_idx" ON "Dish"("popularity");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
