import { Body, Controller, Get, Headers, HttpCode, Logger, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopPaymentProvider } from '@prisma/client';
import { assertCronAuth } from '../common/cron-auth';
import { ShopService, type CreateShopOrderInput } from './shop.service';

/**
 * Public: the website's shop pages (website/src/app/shop) call these directly, like the checkout routes. A buyer
 * needs no account: an order is read or paid again with the token it was created with, sent as X-Order-Token.
 */
@Controller('api/shop')
export class ShopController {
  private readonly logger = new Logger(ShopController.name);

  constructor(private shop: ShopService) {}

  @Get('products')
  products() {
    return this.shop.products();
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.shop.product(slug);
  }

  /** How the buyer can pay, the delivery charge and the countries delivered to. */
  @Get('options')
  options() {
    return this.shop.checkoutOptions();
  }

  @Post('orders')
  createOrder(@Body() body: CreateShopOrderInput) {
    return this.shop.createOrder(body ?? {});
  }

  @Get('orders/:reference')
  order(@Param('reference') reference: string, @Headers('x-order-token') token?: string) {
    return this.shop.orderStatus(reference, token);
  }

  @Post('orders/:reference/pay')
  pay(@Param('reference') reference: string, @Body() body: { provider?: string }, @Headers('x-order-token') token?: string) {
    return this.shop.retryPayment(reference, token, body?.provider);
  }

  /**
   * RaiAccept's notification that a payment changed. It isn't signed, so its body only says which order to look at;
   * the order is read back from RaiAccept before anything is recorded. Answers 200 for orders that aren't ours, and
   * 500 when RaiAccept couldn't be asked, so it sends the notification again.
   */
  @Post('payments/raiaccept/notify')
  @HttpCode(200)
  async raiAcceptNotice(@Body() body: { order?: { orderIdentification?: string } }) {
    try {
      return await this.shop.onProviderNotice(ShopPaymentProvider.RAIACCEPT, body?.order?.orderIdentification);
    } catch (err: any) {
      this.logger.error(`RaiAccept notification for ${body?.order?.orderIdentification} could not be checked: ${err?.message}`);
      throw err;
    }
  }

  /** The local test payment page. Refused in production. */
  @Post('dev/complete')
  completeTestPayment(@Body() body: { paymentId?: string; outcome?: string }) {
    return this.shop.completeTestPayment(body?.paymentId ?? '', body?.outcome ?? '');
  }
}

/** Asks about shop payments left open and releases the stock of orders not paid in time (see ../../vercel.json). */
@Controller('internal/cron')
export class ShopCronController {
  private readonly logger = new Logger(ShopCronController.name);

  constructor(
    private config: ConfigService,
    private shop: ShopService,
  ) {}

  @Get('shop-orders')
  async sweep(@Headers('authorization') authorization?: string) {
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));
    const result = await this.shop.sweep();
    if (result.checked) this.logger.log(`Shop order sweep: ${JSON.stringify(result)}`);
    return result;
  }
}
