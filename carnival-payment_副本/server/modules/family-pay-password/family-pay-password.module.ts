import { Module } from '@nestjs/common';
import { FamilyPayPasswordService } from './pay-password.service';

@Module({
  providers: [FamilyPayPasswordService],
  exports: [FamilyPayPasswordService],
})
export class FamilyPayPasswordModule {}
