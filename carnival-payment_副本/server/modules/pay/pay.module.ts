import { Module } from '@nestjs/common';
import { LeniuModule } from '@server/modules/leniu/leniu.module';
import { IdentityModule } from '@server/modules/identity/identity.module';
import { FamilyPayPasswordModule } from '@server/modules/family-pay-password/family-pay-password.module';
import { PayController } from './pay.controller';
import { RefundController } from './refund.controller';
import { PayService } from './pay.service';
import { RefundService } from './refund.service';
import { FirstLoginService } from './first-login.service';

@Module({
  imports: [LeniuModule, IdentityModule, FamilyPayPasswordModule],
  controllers: [PayController, RefundController],
  providers: [PayService, RefundService, FirstLoginService],
  exports: [PayService, RefundService],
})
export class PayModule {}
