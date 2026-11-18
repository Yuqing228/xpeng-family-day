import { Module } from '@nestjs/common';
import { LeniuModule } from '@server/modules/leniu/leniu.module';
import { IdentityService } from './identity.service';

@Module({
  imports: [LeniuModule],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
