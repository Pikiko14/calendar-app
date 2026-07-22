-- Ask client name during WhatsApp booking
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'BOOKING_NAME';
