-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "maxWorkers" INTEGER,
    "maxServices" INTEGER,
    "maxBranches" INTEGER,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "planId" TEXT;

-- CreateIndex
CREATE INDEX "tenants_planId_idx" ON "tenants"("planId");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed planes
INSERT INTO "plans" ("id", "code", "name", "description", "priceMonthly", "currency", "maxWorkers", "maxServices", "maxBranches", "whatsappEnabled", "aiEnabled", "features", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  (
    'plan_basico',
    'BASICO',
    'Básico',
    'Ideal para empezar: pocos estilistas y servicios esenciales.',
    25000,
    'COP',
    2,
    5,
    1,
    true,
    false,
    '["2 estilistas","5 servicios","1 sede","Bot WhatsApp","Calendario y reservas online"]'::jsonb,
    1,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'plan_pro',
    'PRO',
    'Profesional',
    'Para negocios en crecimiento con más equipo y catálogo.',
    50000,
    'COP',
    8,
    25,
    3,
    true,
    true,
    '["8 estilistas","25 servicios","Hasta 3 sedes","Bot WhatsApp","FAQ con IA","Reportes"]'::jsonb,
    2,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'plan_ilimitado',
    'ILIMITADO',
    'Ilimitado',
    'Todo sin límites para cadenas y negocios de alto volumen.',
    80000,
    'COP',
    NULL,
    NULL,
    NULL,
    true,
    true,
    '["Estilistas ilimitados","Servicios ilimitados","Sedes ilimitadas","Bot WhatsApp","FAQ con IA","Soporte prioritario"]'::jsonb,
    3,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

-- Asignar plan Básico a tenants existentes (o mapear por enum)
UPDATE "tenants" t
SET "planId" = CASE
  WHEN t."plan"::text = 'ENTERPRISE' THEN 'plan_ilimitado'
  WHEN t."plan"::text = 'PRO' THEN 'plan_pro'
  ELSE 'plan_basico'
END,
"plan" = CASE
  WHEN t."plan"::text = 'ENTERPRISE' THEN 'ENTERPRISE'::"TenantPlan"
  WHEN t."plan"::text = 'PRO' THEN 'PRO'::"TenantPlan"
  ELSE 'STARTER'::"TenantPlan"
END
WHERE t."planId" IS NULL;
