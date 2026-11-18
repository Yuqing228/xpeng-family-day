import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';
import { AuthZPaasModule } from '@lark-apaas/nestjs-authzpaas';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { AppConfigModule } from './modules/config/config.module';
import { LeniuModule } from './modules/leniu/leniu.module';
import { IdentityModule } from './modules/identity/identity.module';
import { PaymentModule } from './modules/payment/payment.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { FamilyModule } from './modules/family/family.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { AdminModule } from './modules/admin/admin.module';
import { LeopenModule } from './modules/leopen/leopen.module';
import { PayModule } from './modules/pay/pay.module';
import { MeModule } from './modules/me/me.module';
import { StallModule } from './modules/stall/stall.module';
import { StallWritebackModule } from './modules/stall-writeback/stall-writeback.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot(),
    // 平台账号服务 SDK，提供 AuthorizationSDK.search 搜人能力
    AuthZPaasModule.forRoot(),
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    AppConfigModule,
    LeniuModule,
    IdentityModule,
    PaymentModule,
    EmployeeModule,
    FamilyModule,
    MerchantModule,
    AdminModule,
    LeopenModule,
    PayModule,
    MeModule,
    StallModule,
    StallWritebackModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
