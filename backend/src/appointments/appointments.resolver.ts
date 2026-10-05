import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';
import { AppointmentAlertModel, AppointmentRequestModel, RequestAppointmentInput, ScheduleAppointmentInput } from './models/appointment.model';
import { AppointmentsService } from './appointments.service';

@Resolver()
export class AppointmentsResolver {
  constructor(private appointments: AppointmentsService) {}

  // The patient id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Mutation(() => AppointmentRequestModel, { description: 'Ask to see a doctor. Urgent requests are answered within 24 hours, others within 3 days.' })
  requestAppointment(@CurrentUser() user: AuthUser, @Args('input') input: RequestAppointmentInput) {
    return this.appointments.request(user.id, input);
  }

  @Authorized('PATIENT')
  @Query(() => [AppointmentRequestModel], { description: 'The signed-in patient’s appointment requests, newest first' })
  myAppointments(@CurrentUser() user: AuthUser) {
    return this.appointments.mine(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => AppointmentRequestModel)
  cancelMyAppointment(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.appointments.cancelMine(user.id, id);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [AppointmentAlertModel], { description: 'Appointment requests waiting or booked, urgent and soonest-due first' })
  appointmentRequests() {
    return this.appointments.open();
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => AppointmentRequestModel, { description: 'Book a time with the patient; they are emailed. Audited.' })
  scheduleAppointment(@CurrentUser() user: AuthUser, @Args('input') input: ScheduleAppointmentInput) {
    return this.appointments.schedule(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => AppointmentRequestModel)
  completeAppointment(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string, @Args('note', { nullable: true }) note?: string) {
    return this.appointments.complete(user.id, id, note);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => AppointmentRequestModel, { description: 'Turn a request down, telling the patient why (e.g. "answered by message")' })
  cancelAppointment(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string, @Args('note') note: string) {
    return this.appointments.cancel(user.id, id, note);
  }
}
