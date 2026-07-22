import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key && this.config.get('OPENAI_ENABLED') === 'true') {
      this.client = new OpenAI({ apiKey: key });
    }
  }

  async answerFaq(tenantId: string, question: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: {
        settings: true,
        services: { where: { isActive: true, deletedAt: null }, take: 20 },
        branches: { where: { isActive: true, deletedAt: null }, take: 5 },
      },
    });
    if (!tenant) return 'No encontré información del negocio.';

    const catalog = tenant.services
      .map((s) => `${s.name}: ${s.durationMinutes} min, $${Number(s.price)}`)
      .join('; ');
    const address = tenant.branches[0]?.address || tenant.address || 'consultar';
    const fallback = this.localFaq(question, {
      name: tenant.name,
      address,
      catalog,
      timezone: tenant.timezone,
      currency: tenant.currency,
    });

    if (!this.client) return fallback;

    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.get('OPENAI_MODEL') || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres el asistente de ${tenant.name}. Responde en español, breve y útil. Datos: dirección ${address}, zona ${tenant.timezone}, moneda ${tenant.currency}. Servicios: ${catalog}`,
          },
          { role: 'user', content: question },
        ],
        max_tokens: 300,
      });
      return completion.choices[0]?.message?.content?.trim() || fallback;
    } catch (e) {
      this.logger.warn(`OpenAI error: ${String(e)}`);
      return fallback;
    }
  }

  faq(question: string) {
    return { answer: this.localFaq(question, { name: 'el negocio', address: 'consultar', catalog: '', timezone: 'America/Bogota', currency: 'COP' }), question };
  }

  private localFaq(
    question: string,
    ctx: { name: string; address: string; catalog: string; timezone: string; currency: string },
  ) {
    const q = question.toLowerCase();
    if (q.includes('horario') || q.includes('abre') || q.includes('cierra')) {
      return `Los horarios de ${ctx.name} dependen de cada sede y profesional. Puedes reservar en el portal o por WhatsApp (opción 1).`;
    }
    if (q.includes('ubic') || q.includes('direcci') || q.includes('dónde') || q.includes('donde')) {
      return `Estamos en: ${ctx.address}.`;
    }
    if (q.includes('precio') || q.includes('cuesta') || q.includes('valor')) {
      return ctx.catalog
        ? `Precios (${ctx.currency}): ${ctx.catalog}`
        : `Consulta precios en el portal de reservas de ${ctx.name}.`;
    }
    if (q.includes('servicio')) {
      return ctx.catalog ? `Servicios: ${ctx.catalog}` : `Revisa los servicios en el portal de ${ctx.name}.`;
    }
    if (q.includes('promo')) {
      return 'Escribe 5 en el menú para ver promociones activas.';
    }
    if (q.includes('disponib') || q.includes('cita')) {
      return 'Escribe 1 para reservar y ver disponibilidad en tiempo real.';
    }
    return `Puedo ayudarte con horarios, ubicación, servicios, precios y disponibilidad de ${ctx.name}. ¿Qué necesitas?`;
  }
}
