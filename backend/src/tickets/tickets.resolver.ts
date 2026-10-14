import { Args, ID, Mutation, Query, Resolver, ObjectType, Field } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { TicketsService } from './tickets.service';
import { SupportRequestModel, TicketModel } from './models/ticket.model';
import { SupportRequestInput } from './dto/support-request.input';
import { CreateTicketInput, TicketFilterInput, UpdateTicketInput } from './dto/ticket.input';

@ObjectType('SendToEngineeringResult')
class SendToEngineeringResultModel {
  @Field(() => TicketModel)
  ticket: TicketModel;

  @Field({ description: 'SENT, NOT_CONFIGURED (no Slack address is set) or FAILED' })
  slack: string;
}

@ObjectType('TicketHandler')
class TicketHandlerModel {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}

// Support and admins work every ticket; a doctor sees (and answers) the clinical ones. The pharmacy never sees tickets.
const TICKET_STAFF = [ClinicianRole.ADMIN, ClinicianRole.CX_TEAM, ClinicianRole.DOCTOR] as const;

@Resolver(() => TicketModel)
export class TicketsResolver {
  constructor(private tickets: TicketsService) {}

  @Authorized(...TICKET_STAFF)
  @Query(() => [TicketModel])
  supportTickets(@CurrentUser() user: AuthUser, @Args('filter', { nullable: true }) filter?: TicketFilterInput) {
    return this.tickets.list(user, filter);
  }

  @Authorized(...TICKET_STAFF)
  @Query(() => TicketModel)
  ticket(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.tickets.get(id, user);
  }

  @Authorized(...TICKET_STAFF)
  @Query(() => [TicketHandlerModel], { description: 'Who a ticket can be assigned to' })
  ticketHandlers(@CurrentUser() user: AuthUser, @Args('clinical') clinical: boolean) {
    return this.tickets.handlers(user, clinical);
  }

  @Authorized(...TICKET_STAFF)
  @Mutation(() => TicketModel)
  createTicket(@CurrentUser() user: AuthUser, @Args('input') input: CreateTicketInput) {
    return this.tickets.create(user, input);
  }

  @Authorized(...TICKET_STAFF)
  @Mutation(() => TicketModel)
  updateTicket(@CurrentUser() user: AuthUser, @Args('input') input: UpdateTicketInput) {
    return this.tickets.update(user, input);
  }

  @Authorized(...TICKET_STAFF)
  @Mutation(() => TicketModel, { description: 'Adds an internal note; the patient never sees it' })
  addTicketNote(@CurrentUser() user: AuthUser, @Args('ticketId', { type: () => ID }) ticketId: string, @Args('body') body: string) {
    return this.tickets.addNote(user, ticketId, body);
  }

  @Authorized('PATIENT')
  @Mutation(() => SupportRequestModel, { description: 'The patient asks for help; the care team is told' })
  createSupportRequest(@CurrentUser() user: AuthUser, @Args('input') input: SupportRequestInput) {
    return this.tickets.openAsPatient(user.id, input);
  }

  @Authorized('PATIENT')
  @Query(() => [SupportRequestModel], { description: 'The patient’s own help requests, newest first' })
  mySupportRequests(@CurrentUser() user: AuthUser) {
    return this.tickets.listForPatient(user.id);
  }

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Mutation(() => SendToEngineeringResultModel, { description: 'Passes the ticket to the engineers and tells them in Slack' })
  sendTicketToEngineering(@CurrentUser() user: AuthUser, @Args('ticketId', { type: () => ID }) ticketId: string, @Args('note') note: string) {
    return this.tickets.sendToEngineering(user, ticketId, note);
  }

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Mutation(() => TicketModel, { description: 'The engineers are done: takes the mark off' })
  finishTicketEngineering(@CurrentUser() user: AuthUser, @Args('ticketId', { type: () => ID }) ticketId: string) {
    return this.tickets.finishEngineering(user, ticketId);
  }
}
