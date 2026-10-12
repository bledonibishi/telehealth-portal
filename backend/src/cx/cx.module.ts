import { Module } from '@nestjs/common';
import { CxService } from './cx.service';
import { CxResolver } from './cx.resolver';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CxService, CxResolver],
})
export class CxModule {}
