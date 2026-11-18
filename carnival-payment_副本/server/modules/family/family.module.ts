import { Module } from '@nestjs/common';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyManageService } from './family-manage.service';
import { LeniuModule } from '@server/modules/leniu/leniu.module';
import { PaymentModule } from '@server/modules/payment/payment.module';
import { IdentityModule } from '@server/modules/identity/identity.module';
import { MeModule } from '@server/modules/me/me.module';
import { FamilyPayPasswordModule } from '@server/modules/family-pay-password/family-pay-password.module';

@Module({
  imports: [LeniuModule, PaymentModule, IdentityModule, MeModule, FamilyPayPasswordModule],
  controllers: [FamilyController],
  providers: [FamilyService, FamilyManageService],
})
export class FamilyModule {}
