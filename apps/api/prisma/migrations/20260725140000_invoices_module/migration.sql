-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- AlterTable invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "appointmentId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'COP';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable invoice_items
CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "serviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

ALTER TABLE "invoice_items" DROP CONSTRAINT IF EXISTS "invoice_items_invoiceId_fkey";
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment.invoiceId
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
CREATE INDEX IF NOT EXISTS "payments_invoiceId_idx" ON "payments"("invoiceId");

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_invoiceId_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoice FKs
CREATE INDEX IF NOT EXISTS "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "invoices_tenantId_issuedAt_idx" ON "invoices"("tenantId", "issuedAt");
CREATE INDEX IF NOT EXISTS "invoices_clientId_idx" ON "invoices"("clientId");
CREATE INDEX IF NOT EXISTS "invoices_appointmentId_idx" ON "invoices"("appointmentId");

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_clientId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_appointmentId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
