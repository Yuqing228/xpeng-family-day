import { Module } from '@nestjs/common';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { EmployeeAutomationService } from './employee.automation';
import { EmployeeDirectoryService } from './employee-directory.service';
import { IdentityModule } from '@server/modules/identity/identity.module';
import { LeniuModule } from '@server/modules/leniu/leniu.module';
import { FamilyPayPasswordModule } from '@server/modules/family-pay-password/family-pay-password.module';

@Module({
  imports: [IdentityModule, LeniuModule, FamilyPayPasswordModule],
  controllers: [EmployeeController],
  providers: [EmployeeService, EmployeeAutomationService, EmployeeDirectoryService],
})
export class EmployeeModule {}
