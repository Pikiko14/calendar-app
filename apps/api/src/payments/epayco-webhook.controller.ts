import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SkipSubscription } from '../common/decorators/skip-subscription.decorator';
import {
  EpaycoService,
  type EpaycoConfirmation,
} from './epayco.service';
import { PlansService } from '../plans/plans.service';

@ApiTags('payments')
@Controller('payments/epayco')
export class EpaycoWebhookController {
  constructor(
    private readonly epayco: EpaycoService,
    private readonly plans: PlansService,
  ) {}

  @Public()
  @SkipSubscription()
  @Post('confirmation')
  @ApiExcludeEndpoint()
  async confirmationPost(
    @Body() body: EpaycoConfirmation,
    @Query() query: EpaycoConfirmation,
    @Res() res: Response,
  ) {
    const data = { ...query, ...body };
    await this.plans.handleEpaycoConfirmation(data);
    return res.status(200).send('OK');
  }

  @Public()
  @SkipSubscription()
  @Get('confirmation')
  @ApiExcludeEndpoint()
  async confirmationGet(
    @Query() query: EpaycoConfirmation,
    @Res() res: Response,
  ) {
    await this.plans.handleEpaycoConfirmation(query);
    return res.status(200).send('OK');
  }

  /** Compat: algunos clientes envían form-urlencoded sin Content-Type JSON. */
  @Public()
  @SkipSubscription()
  @Post('webhook')
  @ApiExcludeEndpoint()
  async webhookAlias(
    @Req() req: Request,
    @Body() body: EpaycoConfirmation,
    @Query() query: EpaycoConfirmation,
    @Res() res: Response,
  ) {
    const data = {
      ...(typeof req.body === 'object' && req.body ? req.body : {}),
      ...query,
      ...body,
    } as EpaycoConfirmation;
    await this.plans.handleEpaycoConfirmation(data);
    return res.status(200).send('OK');
  }
}
