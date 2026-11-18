import { Module } from '@nestjs/common';
import { IdentityModule } from '@server/modules/identity/identity.module';
import { LeniuModule } from '@server/modules/leniu/leniu.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [IdentityModule, LeniuModule],
    controllers: [MeController],
    providers: [MeService],
    exports: [MeService],
})
export class MeModule {}
