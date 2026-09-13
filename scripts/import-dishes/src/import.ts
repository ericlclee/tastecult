import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@tastecult/db';
import type { Catalogue } from './transform.js';

const BATCH_SIZE = 1000;

export interface CatalogueImportResult {
  cuisines: number;
  /** Dishes inserted or updated. */
  dishesWritten: number;
  /** Catalogue dishes whose slug is already used by a user-requested (non-approved) dish. */
  dishesConflicting: number;
  parentLinksChanged: number;
  /** Dish–cuisine links added or removed so each dish matches the catalogue. */
  cuisineLinksChanged: number;
  /**
   * Approved dishes in the DB that aren't in this catalogue. Never deleted (logs
   * may reference them), but a non-zero count after a re-import usually means
   * slugs drifted and duplicates were created — investigate before cleaning up.
   */
  staleDishes: number;
}

/**
 * Upserts cuisines and dishes in one transaction, so a failure leaves nothing
 * half-imported. Dishes missing from the catalogue are never deleted — logs
 * may reference them.
 */
export async function importCatalogue(
  prisma: PrismaClient,
  catalogue: Catalogue,
  now: Date = new Date(),
): Promise<CatalogueImportResult> {
  return prisma.$transaction(
    async (tx) => {
      for (const c of catalogue.cuisines) {
        await tx.cuisine.upsert({
          where: { slug: c.slug },
          create: c,
          update: { name: c.name, region: c.region, macroRegion: c.macroRegion },
        });
      }
      const cuisineIds = new Map(
        (await tx.cuisine.findMany({ select: { id: true, slug: true } })).map((c) => [
          c.slug,
          c.id,
        ]),
      );

      // Resolve every dish's cuisines up front, so a bad slug fails before any dish is written
      const cuisineLinks = catalogue.dishes.map((d) => ({
        slug: d.slug,
        cuisineIds: d.cuisineSlugs.map((slug) => {
          const id = cuisineIds.get(slug);
          if (!id) throw new Error(`Dish "${d.slug}" has unknown cuisine "${slug}"`);
          return id;
        }),
      }));

      let dishesWritten = 0;
      for (let i = 0; i < catalogue.dishes.length; i += BATCH_SIZE) {
        const batch = catalogue.dishes.slice(i, i + BATCH_SIZE).map((d) => ({
          // Raw SQL bypasses Prisma's cuid() default; ids are opaque strings
          id: randomUUID(),
          slug: d.slug,
          name: d.name,
          category: d.category,
          otherNames: d.otherNames,
          ingredients: d.ingredients,
          popularity: d.popularity,
        }));

        // Arrays travel as jsonb because jsonb_to_recordset can't cast JSON
        // arrays straight to text[]. The status guard keeps the import from
        // overwriting a dish a user requested under the same slug.
        dishesWritten += await tx.$executeRaw`
          INSERT INTO "Dish" (
            "id", "slug", "name", "category", "otherNames", "ingredients",
            "popularity", "status", "createdAt"
          )
          SELECT
            r."id", r."slug", r."name", r."category",
            ARRAY(SELECT jsonb_array_elements_text(r."otherNames")),
            ARRAY(SELECT jsonb_array_elements_text(r."ingredients")),
            r."popularity", 'APPROVED'::"DishStatus", ${now}::timestamp(3)
          FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS r(
            "id" text, "slug" text, "name" text, "category" text,
            "otherNames" jsonb, "ingredients" jsonb, "popularity" int
          )
          ON CONFLICT ("slug") DO UPDATE SET
            "name" = EXCLUDED."name",
            "category" = EXCLUDED."category",
            "otherNames" = EXCLUDED."otherNames",
            "ingredients" = EXCLUDED."ingredients",
            "popularity" = EXCLUDED."popularity"
          WHERE "Dish"."status" = 'APPROVED'
        `;
      }

      // Second pass: parents may appear later in the list than their variants.
      let parentLinksChanged = 0;
      for (let i = 0; i < catalogue.dishes.length; i += BATCH_SIZE) {
        const links = catalogue.dishes
          .slice(i, i + BATCH_SIZE)
          .map((d) => ({ slug: d.slug, parentSlug: d.parentSlug }));

        parentLinksChanged += await tx.$executeRaw`
          UPDATE "Dish" AS d
          SET "parentId" = p."id"
          FROM jsonb_to_recordset(${JSON.stringify(links)}::jsonb) AS r("slug" text, "parentSlug" text)
          LEFT JOIN "Dish" AS p ON p."slug" = r."parentSlug" AND p."status" = 'APPROVED'
          WHERE d."slug" = r."slug"
            AND d."status" = 'APPROVED'
            AND d."parentId" IS DISTINCT FROM p."id"
        `;
      }

      // Third pass: make each approved dish's cuisine links match the catalogue
      // exactly — add new links and remove ones its versions no longer have.
      let cuisineLinksChanged = 0;
      for (let i = 0; i < cuisineLinks.length; i += BATCH_SIZE) {
        const links = JSON.stringify(cuisineLinks.slice(i, i + BATCH_SIZE));

        cuisineLinksChanged += await tx.$executeRaw`
          DELETE FROM "DishCuisine" AS dc
          USING "Dish" AS d, jsonb_to_recordset(${links}::jsonb) AS r("slug" text, "cuisineIds" jsonb)
          WHERE dc."dishId" = d."id"
            AND d."slug" = r."slug"
            AND d."status" = 'APPROVED'
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(r."cuisineIds") AS c("id")
              WHERE c."id" = dc."cuisineId"
            )
        `;

        // WHERE true stops Postgres reading ON CONFLICT as part of the join
        cuisineLinksChanged += await tx.$executeRaw`
          INSERT INTO "DishCuisine" ("dishId", "cuisineId")
          SELECT d."id", c."id"
          FROM jsonb_to_recordset(${links}::jsonb) AS r("slug" text, "cuisineIds" jsonb)
          JOIN "Dish" AS d ON d."slug" = r."slug" AND d."status" = 'APPROVED'
          CROSS JOIN LATERAL jsonb_array_elements_text(r."cuisineIds") AS c("id")
          WHERE true
          ON CONFLICT DO NOTHING
        `;
      }

      const catalogueSlugs = JSON.stringify(catalogue.dishes.map((d) => d.slug));
      const [stale] = await tx.$queryRaw<[{ count: number }]>`
        SELECT count(*)::int AS "count"
        FROM "Dish"
        WHERE "status" = 'APPROVED'
          AND "slug" NOT IN (SELECT jsonb_array_elements_text(${catalogueSlugs}::jsonb))
      `;

      return {
        cuisines: catalogue.cuisines.length,
        dishesWritten,
        dishesConflicting: catalogue.dishes.length - dishesWritten,
        parentLinksChanged,
        cuisineLinksChanged,
        staleDishes: stale.count,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
