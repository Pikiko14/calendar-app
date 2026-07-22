-- AlterTable workers: cached ratings
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable reviews: link to tenant + worker (nullable first for backfill)
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "workerId" TEXT;

-- Backfill from appointments
UPDATE "reviews" r
SET
  "tenantId" = a."tenantId",
  "workerId" = a."workerId"
FROM "appointments" a
WHERE r."appointmentId" = a."id"
  AND (r."tenantId" IS NULL OR r."workerId" IS NULL);

-- Drop orphan reviews that cannot be linked
DELETE FROM "reviews" WHERE "tenantId" IS NULL OR "workerId" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "reviews" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "workerId" SET NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS "reviews_tenantId_idx" ON "reviews"("tenantId");
CREATE INDEX IF NOT EXISTS "reviews_workerId_idx" ON "reviews"("workerId");

-- Foreign keys (ignore if already exist)
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Recalculate worker rating caches
UPDATE "workers" w
SET
  "ratingCount" = sub.cnt,
  "ratingAvg" = ROUND(sub.avg_rating::numeric, 1)::double precision
FROM (
  SELECT "workerId", COUNT(*)::int AS cnt, AVG("rating") AS avg_rating
  FROM "reviews"
  GROUP BY "workerId"
) sub
WHERE w."id" = sub."workerId";
