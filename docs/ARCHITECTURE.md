# Docs architecture — BeautyBook

## Aislamiento multi-tenant

Todas las entidades de negocio llevan `tenantId`. El JWT incluye `tenantId` + `role`.  
`TenantGuard` bloquea requests autenticados sin negocio (excepto `SUPER_ADMIN`).

## Concurrencia de reservas

1. Transacción Prisma `Serializable`
2. `pg_advisory_xact_lock(hashtext(workerId))` dentro de la TX
3. Chequeo de overlap sobre `bufferStartAt` / `bufferEndAt`
4. Campo `version` para optimistic locking en updates

Dos trabajadores pueden tener citas a la misma hora. El mismo trabajador no.

## WhatsApp

Máquina de estados en `WhatsAppConversation`.  
El webhook/simulate llama a `WhatsappService.handleIncoming`.  
Cron en `NotificationsService` genera recordatorios 24h, 2h y reseñas.

Para producción: worker separado con sesión WhatsApp Web JS (`bot-whatsapp` / Baileys) que reenvía mensajes a este webhook.

## Pagos

`PaymentsService` expone adapters stub. Activar proveedores con env vars.

## Escala

- Stateless API (sesiones WhatsApp en volumen/Redis)
- Redis + BullMQ preparados para colas de notificaciones
- Manifiesto K8s base en `deploy/k8s/`
