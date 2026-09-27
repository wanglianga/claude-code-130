import { Controller, Get, Module, UseGuards, Injectable, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In, LessThan, Not } from 'typeorm';
import {
  ServiceOrder, OrderNode, Incident, FeeItem, StorageRecord, FollowUp, Store, User,
  OrderStatus, NodeStatus, IncidentStatus, FeeStatus, Role, StorageStatus,
} from '../entities';
import { JwtGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../auth';
import { CommonModule } from './common.module';
import { NODE_TYPE_NAMES } from './orders.module';
import { INCIDENT_TYPE_NAMES } from './incidents.module';

@Injectable()
export class ManagerService {
  constructor(
    @InjectRepository(ServiceOrder) private orders: Repository<ServiceOrder>,
    @InjectRepository(OrderNode) private nodes: Repository<OrderNode>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(FeeItem) private fees: Repository<FeeItem>,
    @InjectRepository(StorageRecord) private storageRecords: Repository<StorageRecord>,
    @InjectRepository(FollowUp) private followUps: Repository<FollowUp>,
    @InjectRepository(Store) private stores: Repository<Store>,
  ) {}

  async dashboard() {
    const [orders, nodes, incidents, fees, records, followUps, stores] = await Promise.all([
      this.orders.find(), this.nodes.find(), this.incidents.find(), this.fees.find(),
      this.storageRecords.find(), this.followUps.find(), this.stores.find(),
    ]);
    const now = new Date();
    const byStatus = (arr: any[], k = 'status') => arr.reduce((m, x) => { m[x[k]] = (m[x[k]] || 0) + 1; return m; }, {});

    // 环节承诺时间达成: 已完成节点中 实际<=承诺 的比例 + 当前超时未完成的节点
    const doneNodes = nodes.filter(n => n.status === NodeStatus.DONE && n.promisedAt && n.completedAt);
    const onTime = doneNodes.filter(n => new Date(n.completedAt) <= new Date(n.promisedAt)).length;
    const overdueOpen = nodes.filter(n =>
      ![NodeStatus.DONE, NodeStatus.SKIPPED].includes(n.status) && n.promisedAt && new Date(n.promisedAt) < now,
    ).map(n => ({ ...n, typeName: NODE_TYPE_NAMES[n.type] }));

    // 费用变化(调整/赔付/退款)
    const changes = fees.filter(f => ['ADJUSTMENT', 'COMPENSATION', 'REFUND'].includes(f.category));
    const sum = (arr: FeeItem[]) => Math.round(arr.reduce((s, f) => s + Number(f.amount), 0) * 100) / 100;

    // 待家属确认环节
    const pendingOwnerConfirm = nodes.filter(n => n.status === NodeStatus.DONE && !n.ownerConfirmed).length;

    const openIncidents = incidents.filter(i => [IncidentStatus.OPEN, IncidentStatus.PROCESSING].includes(i.status));
    const incidentByType = openIncidents.reduce((m, i) => {
      const name = INCIDENT_TYPE_NAMES[i.type] || i.type;
      m[name] = (m[name] || 0) + 1;
      return m;
    }, {} as Record<string, number>);

    return {
      orderCount: orders.length,
      orderByStatus: byStatus(orders),
      nodeStats: {
        total: nodes.length,
        done: nodes.filter(n => n.status === NodeStatus.DONE).length,
        onTimeRate: doneNodes.length ? Math.round((onTime / doneNodes.length) * 100) : 100,
        overdueOpenCount: overdueOpen.length,
        overdueOpen: overdueOpen.slice(0, 20),
        pendingOwnerConfirm,
      },
      incidentStats: { open: openIncidents.length, byType: incidentByType, total: incidents.length },
      feeStats: {
        totalBilled: sum(fees.filter(f => Number(f.amount) > 0)),
        totalReceived: sum(fees.filter(f => f.status === FeeStatus.PAID)),
        adjustmentSum: sum(changes),
        pendingConfirm: fees.filter(f => f.status === FeeStatus.PENDING).length,
      },
      storageStats: {
        active: records.filter(r => r.status === StorageStatus.ACTIVE).length,
        expired: records.filter(r => r.status === StorageStatus.EXPIRED).length,
        withdrawn: records.filter(r => r.status === StorageStatus.WITHDRAWN).length,
      },
      followUpStats: {
        pending: followUps.filter(f => f.status === 'PENDING').length,
        done: followUps.filter(f => f.status === 'DONE').length,
      },
      storeStats: stores.map(s => ({
        store: s,
        orders: orders.filter(o => o.storeId === s.id).length,
        activeOrders: orders.filter(o => o.storeId === s.id && ![OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(o.status)).length,
      })),
    };
  }
}

@Controller('api/manager')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.MANAGER)
export class ManagerController {
  constructor(private svc: ManagerService) {}

  @Get('dashboard')
  dashboard() { return this.svc.dashboard(); }
}

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOrder, OrderNode, Incident, FeeItem, StorageRecord, FollowUp, Store, User]), CommonModule],
  controllers: [ManagerController],
  providers: [ManagerService],
})
export class ManagerModule {}
