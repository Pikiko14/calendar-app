-- Documento de identidad para identificar clientes en portal y WhatsApp
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'BOOKING_DOCUMENT';

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "clients_tenantId_documentNumber_key"
  ON "clients"("tenantId", "documentNumber");
