import { Module } from '@nestjs/common';
import { LeniuService } from './leniu.service';
import { LeniuClient } from './leniu.client';

@Module({
  providers: [LeniuService, LeniuClient],
  exports: [LeniuService, LeniuClient],
})
export class LeniuModule {}
