import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { LeadsService } from './leads.service';
import { LeadModel } from './models/lead.model';
import { CreateLeadInput } from './dto/create-lead.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { SALES } from '../auth/access-roles';

@Resolver(() => LeadModel)
export class LeadsResolver {
  constructor(private leadsService: LeadsService) {}

  @Authorized(...SALES)
  @Query(() => [LeadModel])
  leads() {
    return this.leadsService.findAll();
  }

  @Authorized(...SALES)
  @Query(() => LeadModel)
  lead(@Args('id', { type: () => ID }) id: string) {
    return this.leadsService.findById(id);
  }

  // Public — called from /website after quiz completion (before payment)
  @Mutation(() => LeadModel)
  createLead(@Args('input') input: CreateLeadInput) {
    return this.leadsService.upsert(input);
  }
}
