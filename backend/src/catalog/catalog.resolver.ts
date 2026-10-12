import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { CatalogService } from './catalog.service';
import { ProductModel } from './models/product.model';
import { PrescriptionTemplateModel } from './models/prescription-template.model';
import { ClinicianRole, ConsultationKind } from '../common/enums';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { PRESCRIBERS, STAFF } from '../auth/access-roles';

@Resolver(() => ProductModel)
export class CatalogResolver {
  constructor(private catalog: CatalogService) {}

  @Authorized(...STAFF)
  @Query(() => [ProductModel], { description: 'Prescribable medicines; inactive ones only when asked' })
  products(
    @Args('kind', { type: () => ConsultationKind, nullable: true }) kind?: ConsultationKind,
    @Args('includeInactive', { nullable: true, defaultValue: false }) includeInactive?: boolean,
  ) {
    return this.catalog.findProducts({ kind, includeInactive });
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [PrescriptionTemplateModel], { description: 'One-click prescription templates for a programme, matched to the live catalog' })
  prescriptionTemplates(@Args('kind', { type: () => ConsultationKind }) kind: ConsultationKind) {
    return this.catalog.findTemplates(kind);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ProductModel, { description: 'Withdraw a product from (or return it to) prescribing' })
  setProductActive(@Args('id', { type: () => ID }) id: string, @Args('active') active: boolean) {
    return this.catalog.setProductActive(id, active);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ProductModel, { description: 'Withdraw a single strength, e.g. during a supply shortage' })
  setProductStrengthActive(@Args('id', { type: () => ID }) id: string, @Args('active') active: boolean) {
    return this.catalog.setStrengthActive(id, active);
  }
}
