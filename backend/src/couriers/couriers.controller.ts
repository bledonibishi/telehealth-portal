import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Param, Post, Req, ServiceUnavailableException, UnauthorizedException, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CouriersService } from './couriers.service';

/**
 * Where a courier (or the service tracking for them) tells us what happened to a parcel.
 * POST /courier/webhook/<provider>, signed; see docs/courier-webhook.md for what to send.
 */
@Controller('courier')
export class CouriersController {
  constructor(private couriers: CouriersService) {}

  @Post('webhook/:provider')
  @HttpCode(200)
  async webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const adapter = this.couriers.adapter(provider);
    if (!adapter) throw new NotFoundException('Unknown courier');

    const secret = this.couriers.secretFor(provider);
    if (!secret) throw new ServiceUnavailableException('This courier connection is not set up yet');
    // The signature covers the exact bytes sent, so it is checked against the raw body (see rawBody in create-app.ts).
    if (!req.rawBody) throw new BadRequestException('Missing request body');
    if (!adapter.verify({ rawBody: req.rawBody, headers: req.headers, secret })) throw new UnauthorizedException('Signature check failed');

    // Recorded under the name in the URL (e.g. "beki"), so the audit trail says which courier it was.
    return this.couriers.handle(adapter.parse(body), provider.toLowerCase());
  }
}
