import { Module } from '@nestjs/common';
import { AdminModule } from '@server/modules/admin/admin.module';
import { StallWritebackController } from './stall-writeback.controller';
import { StallWritebackService } from './stall-writeback.service';
import { StallWritebackAutomationService } from './stall-writeback.automation';

@Module({
  imports: [AdminModule],
  controllers: [StallWritebackController],
  providers: [StallWritebackService, StallWritebackAutomationService],
})
export class StallWritebackModule {}
