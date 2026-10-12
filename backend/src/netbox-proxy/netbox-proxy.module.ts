import { Module } from '@nestjs/common';
import { NetboxProxyController } from './netbox-proxy.controller';
import { NetboxProxyService } from './netbox-proxy.service';

@Module({
  controllers: [NetboxProxyController],
  providers: [NetboxProxyService],
})
export class NetboxProxyModule {}
