import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PartnerOrdersService } from './partner-orders.service';
import { OrdersService } from './orders.service';
import { assertCronAuth } from '../common/cron-auth';

/**
 * Retries partner deliveries that failed and sends orders nobody has sent yet. Called by Vercel
 * Cron (see ../../vercel.json), which attaches `Authorization: Bearer $CRON_SECRET` when that
 * variable is set — the same arrangement as the dose-reminder job.
 */
@Controller('internal/cron')
export class PartnerOrdersCronController {
  private readonly logger = new Logger(PartnerOrdersCronController.name);

  constructor(
    private config: ConfigService,
    private partner: PartnerOrdersService,
    private orders: OrdersService,
  ) {}

  @Get('partner-orders')
  async sweep(@Headers('authorization') authorization?: string) {
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));

    const result = await this.partner.sweep();
    if (result.attempted) this.logger.log(`Partner order sweep: ${JSON.stringify(result)}`);
    return result;
  }

  /** Asks for payment on supplies still waiting to be asked, and reminds patients who have not paid. */
  @Get('supply-payments')
  async supplyPayments(@Headers('authorization') authorization?: string) {
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));

    const result = await this.orders.sweepPayments();
    if (result.requested || result.reminded) this.logger.log(`Supply payment sweep: ${JSON.stringify(result)}`);
    return result;
  }
}
