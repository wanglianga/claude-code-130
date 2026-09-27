import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { config } from './config';
import { ALL_ENTITIES } from './entities';
import { AuthModule } from './modules/auth.module';
import { CommonModule } from './modules/common.module';
import { OrdersModule } from './modules/orders.module';
import { IncidentsModule } from './modules/incidents.module';
import { FeesModule } from './modules/fees.module';
import { StorageModule } from './modules/storage.module';
import { OpsModule } from './modules/ops.module';
import { BaseModule } from './modules/base.module';
import { ManagerModule } from './modules/manager.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: config.db.host,
      port: config.db.port,
      username: config.db.username,
      password: config.db.password,
      database: config.db.database,
      entities: ALL_ENTITIES,
      synchronize: true,
      charset: 'utf8mb4',
    }),
    CommonModule,
    AuthModule,
    OrdersModule,
    IncidentsModule,
    FeesModule,
    StorageModule,
    OpsModule,
    BaseModule,
    ManagerModule,
  ],
})
export class AppModule {}
