import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { MerchantRefundService } from './merchant-refund.service';
import { PaymentModule } from '@server/modules/payment/payment.module';

@Module({
  imports: [PaymentModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantRefundService],
})
export class MerchantModule {}
