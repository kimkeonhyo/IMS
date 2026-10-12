import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { StorageModule } from './storage/storage.module';
import { ItemsModule } from './items/items.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchaseRequestsModule } from './purchase-requests/purchase-requests.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { StoreModule } from './store/store.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { StockUsagesModule } from './stock-usages/stock-usages.module';
import { RepairsModule } from './repairs/repairs.module';
import { RolePermissionsModule } from './role-permissions/role-permissions.module';
import { RolePermission } from './role-permissions/role-permission.entity';
import { Repair } from './repairs/repair.entity';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { TeamsModule } from './teams/teams.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { AssetInstancesModule } from './asset-instances/asset-instances.module';
import { AssetInstance } from './asset-instances/asset-instance.entity';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { Delivery } from './deliveries/delivery.entity';
import { DeliveryItem } from './deliveries/delivery-item.entity';
import { SerialNumbersModule } from './serial-numbers/serial-numbers.module';
import { SerialNumber } from './serial-numbers/serial-number.entity';
import { EmailModule } from './email/email.module';
import { RegistrationRequest } from './auth/registration-request.entity';
import { DcInventoryModule } from './dc-inventory/dc-inventory.module';
import { DcRack } from './dc-inventory/dc-rack.entity';
import { DcDevice } from './dc-inventory/dc-device.entity';
import { DcIpAddress } from './dc-inventory/dc-ip-address.entity';
import { DcConnection } from './dc-inventory/dc-connection.entity';

import { Employee } from './employees/employee.entity';
import { Storage } from './storage/storage.entity';
import { Item } from './items/item.entity';
import { Inventory } from './inventory/inventory.entity';
import { PurchaseRequest } from './purchase-requests/purchase-request.entity';
import { PurchaseRequestItem } from './purchase-requests/purchase-request-item.entity';
import { PurchaseOrder } from './purchase-orders/purchase-order.entity';
import { PurchaseOrderItem } from './purchase-orders/purchase-order-item.entity';
import { Store } from './store/store.entity';
import { StockReceiptItem } from './stock-receipt-items/stock-receipt-item.entity';
import { StockMovement } from './stock-movements/stock-movement.entity';
import { StockUsage } from './stock-usages/stock-usage.entity';
import { AuditLog } from './audit-logs/audit-log.entity';
import { Team } from './teams/team.entity';
import { Shipment } from './shipments/shipment.entity';
import { ShipmentItem } from './shipments/shipment-item.entity';
import { ShipmentService } from './shipments/shipment-service.entity';
import { ShipmentServiceImage } from './shipments/shipment-service-image.entity';
import { NotionCatalogModule } from './notion-catalog/notion-catalog.module';
import { NetboxProxyModule } from './netbox-proxy/netbox-proxy.module';
import { NetboxSyncModule } from './netbox-sync/netbox-sync.module';
import { AssetImagesModule } from './asset-images/asset-images.module';
import { AssetImage } from './asset-images/asset-image.entity';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'ims_user',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE || 'ims',
      entities: [
        Employee, Storage, Item, Inventory,
        PurchaseRequest, PurchaseRequestItem,
        PurchaseOrder, PurchaseOrderItem,
        Store, StockReceiptItem,
        StockMovement,
        StockUsage,
        Repair,
        RolePermission,
        AuditLog,
        Team,
        Shipment, ShipmentItem,
        ShipmentService, ShipmentServiceImage,
        AssetInstance,
        Delivery, DeliveryItem,
        SerialNumber,
        RegistrationRequest,
        DcRack, DcDevice, DcIpAddress, DcConnection,
        AssetImage,
      ],
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
    }),
    AuthModule,
    EmployeesModule,
    StorageModule,
    ItemsModule,
    InventoryModule,
    PurchaseRequestsModule,
    PurchaseOrdersModule,
    StoreModule,
    StockMovementsModule,
    StockUsagesModule,
    RepairsModule,
    RolePermissionsModule,
    AuditLogsModule,
    TeamsModule,
    ShipmentsModule,
    AssetInstancesModule,
    DeliveriesModule,
    SerialNumbersModule,
    EmailModule,
    DcInventoryModule,
    NotionCatalogModule,
    NetboxProxyModule,
    NetboxSyncModule,
    AssetImagesModule,
  ],
})
export class AppModule {}
