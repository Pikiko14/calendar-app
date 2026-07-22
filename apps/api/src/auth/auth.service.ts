import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DayOfWeek } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_WEEK_BLOCKS } from '../common/schedule.util';
import { LoginDto, RegisterTenantDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private async tokens(user: any) {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('jwt.secret'),
      expiresIn: this.config.get('jwt.refreshExpiresIn'),
    });
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 864e5),
      },
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async register(dto: RegisterTenantDto) {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) {
      throw new ConflictException(
        'Este identificador de negocio ya está en uso.',
      );
    }
    const hash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.slug,
          email: dto.email,
          phone: dto.phone,
          settings: { create: {} },
        },
      });
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Sede Principal',
          slug: 'principal',
          isMain: true,
        },
      });
      for (const [dayOfWeek, conf] of Object.entries(DEFAULT_WEEK_BLOCKS)) {
        await tx.branchSchedule.create({
          data: {
            branchId: branch.id,
            dayOfWeek: dayOfWeek as DayOfWeek,
            isClosed: conf.isClosed,
            blocks: {
              create: conf.blocks.map((b, i) => ({ ...b, sortOrder: i })),
            },
          },
        });
      }
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash: hash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: 'ADMIN',
        },
      });
    });
    return this.tokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null, isActive: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.tokens(user);
  }

  async refresh(token: string) {
    const saved = await this.prisma.refreshToken.findFirst({
      where: {
        token,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true, deletedAt: null },
      },
      include: { user: true },
    });
    if (!saved) throw new UnauthorizedException('La sesión ha expirado.');
    await this.prisma.refreshToken.update({
      where: { id: saved.id },
      data: { revokedAt: new Date() },
    });
    return this.tokens(saved.user);
  }

  async me(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        tenantId: true,
        tenant: true,
      },
    });
  }
}
