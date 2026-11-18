import { Module } from '@nestjs/common';
import { AdminModule } from '@server/modules/admin/admin.module';
import { LeopenController } from './leopen.controller';
import { LeopenService } from './leopen.service';

@Module({
  imports: [AdminModule],
  controllers: [LeopenController],
  providers: [LeopenService],
})
export class LeopenModule {}
