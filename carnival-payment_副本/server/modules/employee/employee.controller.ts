import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LoginGuard } from '@server/common/guards/login.guard';
import { ReqUserId, ReqUserName } from '@server/common/decorators/user.decorator';
import { EmployeeService } from './employee.service';
import type {
  AutoBindResponse,
  BindCardRequest,
  BindCardResponse,
  CreateFamilyRequest,
  EmployeeSession,
  FamilyPayPasswordSetRequest,
} from '@shared/api.interface';

@Controller('api/employee')
@UseGuards(LoginGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get('session')
  async session(@ReqUserId() userId: string, @ReqUserName() userName: string): Promise<EmployeeSession> {
    return this.employeeService.session(userId, userName);
  }

  @Post('bind-card')
  async bindCard(
    @ReqUserId() userId: string,
    @ReqUserName() userName: string,
    @Body() req: BindCardRequest,
  ): Promise<BindCardResponse> {
    return this.employeeService.bindCard(userId, userName, req);
  }

  @Post('auto-bind')
  async autoBind(
    @ReqUserId() userId: string,
    @ReqUserName() userName: string,
  ): Promise<AutoBindResponse> {
    return this.employeeService.autoBindByUserName(userId, userName);
  }

  @Get('identities')
  async identities(@ReqUserId() userId: string) {
    return this.employeeService.identities(userId);
  }

  @Post('family')
  async createFamily(@ReqUserId() userId: string, @Body() req: CreateFamilyRequest) {
    const identity = await this.employeeService.createFamily(userId, req);
    return { identity };
  }

  @Delete('family/:id')
  async deleteFamily(@ReqUserId() userId: string, @Param('id') id: string) {
    await this.employeeService.deleteFamily(userId, id);
    return { deleted: true };
  }

  @Post('family/:id/shared')
  async markShared(@ReqUserId() userId: string, @Param('id') id: string) {
    await this.employeeService.markShared(userId, id);
    return { shared: true };
  }

  @Post('pay-password')
  async setFamilyPayPassword(
    @ReqUserId() userId: string,
    @Body() req: FamilyPayPasswordSetRequest,
  ) {
    await this.employeeService.setFamilyPayPassword(userId, req);
    return { payPasswordSet: true };
  }

  @Post('pay-password/unlock')
  async unlockFamilyPayPassword(@ReqUserId() userId: string) {
    await this.employeeService.unlockFamilyPayPassword(userId);
    return { unlocked: true };
  }

  @Get('bill')
  async myBill(@ReqUserId() userId: string) {
    return this.employeeService.myBill(userId);
  }

  @Get('bill/:txnNo')
  async myDetail(@ReqUserId() userId: string, @Param('txnNo') txnNo: string) {
    return this.employeeService.myDetail(userId, txnNo);
  }

  @Get('self-token')
  async selfToken(@ReqUserId() userId: string) {
    return this.employeeService.selfToken(userId);
  }
}
