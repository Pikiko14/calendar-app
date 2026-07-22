# BeautyBook

SaaS multi-tenant para **barberías, peluquerías y SPA**. Experiencia tipo Calendly + Fresha + Booksy, con motor de reservas concurrente y asistente inteligente por WhatsApp.

## Stack

| Capa | Tecnología |
|------|------------|
| API | NestJS, Prisma, PostgreSQL, Redis, BullMQ, JWT, Swagger, Socket.io |
| Web | Vue 3, Vite, Pinia, Tailwind, Vue Query, Chart.js, PWA |
| Infra | Docker Compose, NGINX |

## Arranque rápido

```bash
# 1. Variables de entorno
copy .env.example .env
copy apps\web\.env.example apps\web\.env

# 2. Infra local (Postgres + Redis)
npm run docker:up

# 3. API
cd apps\api
npm install
npm run prisma:generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev

# 4. Web (otra terminal)
cd apps\web
npm install
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3000/api/v1  
- Swagger: http://localhost:3000/api/docs  

### Credenciales demo (seed)

| Campo | Valor |
|-------|--------|
| Portal | `/barberia-premium` |
| Email | `admin@barberiapremium.test` |
| Password | `Admin12345!` |

## Arquitectura

```
apps/
  api/          NestJS — DDD ligero, multi-tenant por JWT (tenantId)
  web/          Vue 3 — dashboard + portal público SSR-ready
nginx/          Reverse proxy producción
docker-compose  Postgres, Redis, API, Web, NGINX
```

### Multi-tenant

Cada empresa (`Tenant`) aísla clientes, trabajadores, agenda, servicios, reservas, estadísticas, branding y bot WhatsApp. El `TenantGuard` exige `tenantId` en el JWT en rutas privadas.

### Motor de reservas

- Validación de horario laboral, bloques (ej. 08–12 / 14–18), vacaciones, festivos
- Buffers: preparación, limpieza, traslado
- Sin doble booking del mismo trabajador (dos trabajadores a la misma hora sí)
- Transacción `Serializable` + `pg_advisory_xact_lock` por worker
- Optimistic locking (`version`) en cambios de estado / reprogramación

### WhatsApp

Flujo conversacional con estados: menú, reserva (servicio → día → trabajador → hora), consulta, cancelación, reprogramación, promociones, asesor, FAQ/IA.

Recordatorios cron:

- 24 h antes → Confirmar / Reprogramar / Cancelar  
- 2 h antes → “Te esperamos”  
- Post-cita → solicitud de reseña  

Endpoint de simulación: `POST /api/v1/whatsapp/simulate`

### Roles

`ADMIN` · `RECEPTIONIST` · `WORKER` · `CLIENT` · `SUPER_ADMIN`

## Decisiones de diseño

1. **Prisma + PostgreSQL** como fuente de verdad; índices en `(workerId, startAt/endAt)` y buffers.
2. **CQRS selectivo**: lecturas de dashboard/reportes separadas de comandos de agenda.
3. **Pagos**: adapters stub (Stripe, MercadoPago, Wompi, PayPal) + pago local.
4. **OpenAI** opcional (`OPENAI_ENABLED=true`) para FAQ; fallback local sin clave.
5. **Kubernetes/AWS-ready**: contenedores sin estado salvo volúmenes de uploads y sesiones WhatsApp.

## Scripts útiles

```bash
npm run docker:up       # solo DB + Redis
npm run docker:full     # stack completo
npm run build           # api + web
```

## Roadmap cercano

- Conector real `@bot-whatsapp` / WhatsApp Web JS en worker dedicado  
- Drag-and-drop persistente en calendario  
- Export PDF/Excel de reportes  
- GraphQL gateway (schema-first) sobre los mismos casos de uso  

## Licencia

Privado / UNLICENSED.
