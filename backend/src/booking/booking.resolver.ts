import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, CLINICAL_STAFF } from '../auth/access-roles';
import { BookingService } from './booking.service';
import { BookingModel, BookingSessionModel, StaffBookingModel } from './models/booking.model';

const DAY_MS = 86_400_000;
const MAX_WINDOW_DAYS = 93;

@Resolver()
export class BookingResolver {
  constructor(private service: BookingService) {}

  // The patient id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Query(() => BookingSessionModel, { nullable: true, description: 'What the scheduler needs to let the patient book this. Null while scheduling is not set up for the purpose.' })
  bookingSession(
    @CurrentUser() user: AuthUser,
    @Args('purpose') purpose: string,
    @Args('referenceId', { type: () => ID, nullable: true }) referenceId?: string,
  ) {
    return this.service.session(user.id, purpose, referenceId);
  }

  @Authorized('PATIENT')
  @Query(() => [BookingModel], { description: 'The signed-in patient’s upcoming bookings, soonest first' })
  myBookings(@CurrentUser() user: AuthUser) {
    return this.service.mine(user.id);
  }

  @Authorized('PATIENT')
  @Query(() => [BookingModel], { description: 'The signed-in patient’s past and cancelled bookings, newest first' })
  myPastBookings(@CurrentUser() user: AuthUser) {
    return this.service.past(user.id);
  }

  @Authorized('PATIENT')
  @Query(() => BookingSessionModel, { nullable: true, description: 'What the scheduler needs to move one of your own bookings. Null when it can no longer be moved.' })
  rescheduleSession(@CurrentUser() user: AuthUser, @Args('uid') uid: string) {
    return this.service.rescheduleSession(user.id, uid);
  }

  @Authorized('PATIENT')
  @Mutation(() => BookingModel, { description: 'Cancel one of your own bookings; the slot is freed and the host is told' })
  cancelMyBooking(@CurrentUser() user: AuthUser, @Args('uid') uid: string, @Args('reason', { nullable: true }) reason?: string) {
    return this.service.cancelMine(user.id, uid, reason);
  }

  @Authorized(...CLINICAL_STAFF)
  @Query(() => [StaffBookingModel], { description: 'Everything booked in a window (default: the next 14 days), optionally for one patient' })
  bookings(
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
    @Args('patientId', { type: () => ID, nullable: true }) patientId?: string,
  ) {
    const start = from ?? new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ?? new Date(start.getTime() + 14 * DAY_MS);
    if (!(end > start) || end.getTime() - start.getTime() > MAX_WINDOW_DAYS * DAY_MS) throw new BadRequestException(`Choose a window of up to ${MAX_WINDOW_DAYS} days`);
    return this.service.between(start, end, patientId);
  }
}
