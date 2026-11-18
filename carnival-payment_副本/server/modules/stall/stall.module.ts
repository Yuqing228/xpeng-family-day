import { Module } from '@nestjs/common';
import { StallController } from './stall.controller';
import { StallService } from './stall.service';

@Module({
  controllers: [StallController],
  providers: [StallService],
})
export class StallModule {}
