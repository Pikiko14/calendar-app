-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'CANCELLED', 'PAST_DUE');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Activar suscripción Ilimitada para The barber shop (si existe)
INSERT INTO "subscriptions" ("id", "tenantId", "planId", "status", "startsAt", "endsAt", "notes", "createdAt", "updatedAt")
SELECT
  'sub_the_barber_shop',
  t."id",
  p."id",
  'ACTIVE'::"SubscriptionStatus",
  CURRENT_TIMESTAMP,
  NULL,
  'Suscripción manual inicial',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN "plans" p
WHERE p."code" = 'ILIMITADO'
  AND t."deletedAt" IS NULL
  AND (
    lower(t."slug") = 'the-barber-shop'
    OR lower(t."name") = 'the barber shop'
  )
ON CONFLICT ("tenantId") DO UPDATE
SET
  "planId" = EXCLUDED."planId",
  "status" = 'ACTIVE'::"SubscriptionStatus",
  "notes" = EXCLUDED."notes",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "tenants" t
SET
  "planId" = p."id",
  "plan" = 'ENTERPRISE'::"TenantPlan",
  "status" = 'ACTIVE'::"TenantStatus"
FROM "plans" p
WHERE p."code" = 'ILIMITADO'
  AND t."deletedAt" IS NULL
  AND (
    lower(t."slug") = 'the-barber-shop'
    OR lower(t."name") = 'the barber shop'
  );
