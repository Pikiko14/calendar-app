-- Specialties catalog (missing from init migration)
CREATE TABLE IF NOT EXISTS "specialties" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0F766E',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "worker_specialties" (
    "workerId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,

    CONSTRAINT "worker_specialties_pkey" PRIMARY KEY ("workerId","specialtyId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "specialties_tenantId_name_key" ON "specialties"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "specialties_tenantId_isActive_idx" ON "specialties"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "worker_specialties_specialtyId_idx" ON "worker_specialties"("specialtyId");

DO $$ BEGIN
  ALTER TABLE "specialties" ADD CONSTRAINT "specialties_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "worker_specialties" ADD CONSTRAINT "worker_specialties_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "worker_specialties" ADD CONSTRAINT "worker_specialties_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
