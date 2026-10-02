import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, FULFILMENT } from '../auth/access-roles';
import { OrderModel } from './models/order.model';
import { PartnerIntegrationStatusModel } from './models/partner-transmission.model';
import { PartnerOrdersService } from './partner-orders.service';
import { OrdersService } from './orders.service';

@Resolver()
export class PartnerOrdersResolver {
  constructor(
    private partner: PartnerOrdersService,
    private orders: OrdersService,
  ) {}

  @Authorized(...FULFILMENT)
  @Query(() => PartnerIntegrationStatusModel, { description: 'Which ways of reaching the pharmacy partner are set up' })
  partnerIntegrationStatus() {
    return this.partner.integrationStatus();
  }

  @Authorized(...FULFILMENT)
  @AuditRead('Order', 'orderId')
  @Query(() => String, { description: 'The structured order summary for the pharmacy partner, as formatted JSON — to copy when there is no automatic channel' })
  async orderPartnerPayload(@Args('orderId', { type: () => ID }) orderId: string) {
    return JSON.stringify(await this.partner.payloadFor(orderId), null, 2);
  }

  @Authorized(...FULFILMENT)
  @Mutation(() => OrderModel, { description: 'Send (or resend) an order to the pharmacy partner now' })
  async sendOrderToPartner(@CurrentUser() user: AuthUser, @Args('orderId', { type: () => ID }) orderId: string) {
    await this.partner.send(orderId, { actorId: user.id, force: true });
    return this.orders.findOne(orderId);
  }
}
