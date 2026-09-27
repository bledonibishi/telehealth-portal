import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadModel } from './models/lead.model';
import { CreateLeadInput } from './dto/create-lead.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';

@Resolver(() => LeadModel)
export class LeadsResolver {
  constructor(private leadsService: LeadsService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [LeadModel])
  leads() {
    return this.leadsService.findAll();
  }

  @UseGuards(GqlAuthGuard)
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
