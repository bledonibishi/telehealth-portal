import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CareTeamResolver } from './care-team.resolver';

@Module({ imports: [PrismaModule], providers: [CareTeamResolver] })
export class CareTeamModule {}
