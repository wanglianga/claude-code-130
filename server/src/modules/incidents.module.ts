import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Incident, ServiceOrder, OrderNode, FeeItem, KeepsakeJob, Shipment, StorageRecord, FollowUp, User,
  IncidentType, IncidentStatus, FeeCategory, KeepsakeStatus, ShipmentStatus, Role, NodeType, FollowUpType,
} from '../entities';
import { JwtGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../auth';
import { NotifyService } from './common.module';
import { CommonModule } from './common.module';
import { OrdersModule, OrdersService, NODE_TYPE_NAMES } from './orders.module';

export const INCIDENT_TYPE_NAMES: Record<string, string> = {
  CEREMONY_RESCHEDULE: '仪式改期', WEIGHT_MISMATCH: '体重与报价不符', TRAFFIC_DELAY: '接送交通延误',
  VIDEO_WITNESS: '家属视频见证', KEEPSAKE_FAILURE: '纪念品制作失败', SHIPPING_DAMAGE: '骨灰盒寄送破损',
  STORAGE_EXPIRED: '寄存到期未续费', OTHER: '其他异常',
};

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(ServiceOrder) private orders: Repository<ServiceOrder>,
    @InjectRepository(OrderNode) private nodes: Repository<OrderNode>,
    @InjectRepository(FeeItem) private fees: Repository<FeeItem>,
    @InjectRepository(KeepsakeJob) private keepsakes: Repository<KeepsakeJob>,
    @InjectRepository(Shipment) private shipments: Repository<Shipment>,
    @InjectRepository(StorageRecord) private storageRecords: Repository<StorageRecord>,
    @InjectRepository(FollowUp) private followUps: Repository<FollowUp>,
    @InjectRepository(User) private users: Repository<User>,
    private notify: NotifyService,
    private ordersService: OrdersService,
  ) {}

  async create(user: AuthUser, orderId: number, dto: any) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (user.role === Role.OWNER && order.ownerId !== user.id) throw new ForbiddenException('无权操作');
    if (!dto.type || !INCIDENT_TYPE_NAMES[dto.type]) throw new BadRequestException('异常类型不正确');
    const incident = await this.incidents.save(this.incidents.create({
      orderId, type: dto.type, title: dto.title || INCIDENT_TYPE_NAMES[dto.type],
      description: dto.description || '', createdById: user.id,
      relatedNodeId: dto.relatedNodeId || null, meta: dto.meta || null,
    }));
    // 类型相关的即时联动
    if (dto.type === IncidentType.TRAFFIC_DELAY && dto.meta?.newPromisedAt) {
      const pickupNode = await this.nodes.findOne({ where: { orderId, type: NodeType.PICKUP } });
      if (pickupNode && pickupNode.status !== 'DONE') {
        pickupNode.promisedAt = new Date(dto.meta.newPromisedAt);
        await this.nodes.save(pickupNode);
      }
      await this.notify.toUser(order.ownerId, `订单 ${order.code} 接送途中交通延误,新的预计到达时间 ${new Date(dto.meta.newPromisedAt).toLocaleString('zh-CN')},敬请谅解`, orderId);
    }
    if (dto.type === IncidentType.VIDEO_WITNESS) {
      const cremationNode = await this.nodes.findOne({ where: { orderId, type: NodeType.CREMATION } });
      if (cremationNode) {
        cremationNode.note = `${cremationNode.note || ''} [家属要求视频见证]`.trim();
        await this.nodes.save(cremationNode);
        if (cremationNode.assigneeId) {
          await this.notify.toUser(cremationNode.assigneeId, `订单 ${order.code} 家属要求火化视频见证,请准备视频记录`, orderId);
        }
      }
    }
    await this.notify.toRole([Role.CS, Role.MANAGER], `订单 ${order.code} 新异常工单:${incident.title}`, orderId, order.storeId);
    return incident;
  }

  async list(user: AuthUser, query: any) {
    const qb = this.incidents.createQueryBuilder('i').orderBy('i.id', 'DESC');
    if (query.orderId) qb.where('i.orderId = :oid', { oid: query.orderId });
    if (query.status) qb.andWhere('i.status = :st', { st: query.status });
    const list = await qb.take(300).getMany();
    if (!list.length) return [];
    const orders = await this.orders.find({ where: { id: In(list.map(i => i.orderId)) } });
    const myOrders = new Set(orders.filter(o =>
      user.role === Role.MANAGER || user.role === Role.FINANCE ||
      (user.role === Role.OWNER && o.ownerId === user.id) ||
      (user.storeId && o.storeId === user.storeId),
    ).map(o => o.id));
    const visible = list.filter(i => myOrders.has(i.orderId) || i.createdById === user.id);
    const users = await this.users.find({ where: { id: In(visible.flatMap(i => [i.createdById, i.handledById].filter(Boolean))) } });
    return visible.map(i => ({
      ...i,
      typeName: INCIDENT_TYPE_NAMES[i.type],
      order: orders.find(o => o.id === i.orderId) || null,
      createdByName: users.find(u => u.id === i.createdById)?.name,
      handledByName: i.handledById ? users.find(u => u.id === i.handledById)?.name : null,
    }));
  }

  async claim(user: AuthUser, id: number) {
    const inc = await this.mustGet(id);
    if (inc.status === IncidentStatus.RESOLVED || inc.status === IncidentStatus.CLOSED) throw new BadRequestException('工单已关闭');
    inc.handledById = user.id;
    inc.status = IncidentStatus.PROCESSING;
    return this.incidents.save(inc);
  }

  /**
   * 处理异常工单。按类型执行联动:
   * - WEIGHT_MISMATCH: meta.adjustAmount → 生成费用调整项(财务确认)
   * - CEREMONY_RESCHEDULE: meta.newTime → 更新仪式时间
   * - TRAFFIC_DELAY: meta.newPromisedAt → 更新接送承诺时间
   * - KEEPSAKE_FAILURE: action=REMAKE 重做 / REFUND 退款
   * - SHIPPING_DAMAGE: meta.compensation → 生成赔付费(负值)
   * - STORAGE_EXPIRED: 提醒主人续费(生成回访)
   */
  async resolve(user: AuthUser, id: number, dto: any) {
    const inc = await this.mustGet(id);
    if ([IncidentStatus.RESOLVED, IncidentStatus.CLOSED].includes(inc.status)) throw new BadRequestException('工单已处理完成');
    const order = await this.orders.findOne({ where: { id: inc.orderId } });
    const meta = { ...(inc.meta || {}), ...(dto.meta || {}) };

    switch (inc.type) {
      case IncidentType.WEIGHT_MISMATCH: {
        const adjust = Number(meta.adjustAmount || 0);
        if (!adjust) throw new BadRequestException('请填写费用调整金额(正数补收/负数退还)');
        await this.fees.save(this.fees.create({
          orderId: inc.orderId, name: `体重差异费用调整(报价${order.quotedWeightKg}kg → 实际${meta.actualWeightKg || '?'}kg)`,
          amount: adjust, category: FeeCategory.ADJUSTMENT, incidentId: inc.id, createdById: user.id,
        }));
        await this.notify.toRole([Role.FINANCE], `订单 ${order.code} 产生体重差异费用调整 ¥${adjust},请审核`, inc.orderId, order.storeId);
        await this.notify.toUser(order.ownerId, `订单 ${order.code} 因实际体重与报价不符产生费用调整 ¥${adjust},请查看费用明细`, inc.orderId);
        break;
      }
      case IncidentType.CEREMONY_RESCHEDULE: {
        if (meta.newTime) {
          order.ceremonyTime = new Date(meta.newTime);
          await this.orders.save(order);
          const node = await this.nodes.findOne({ where: { orderId: inc.orderId, type: NodeType.CEREMONY } });
          if (node && node.status !== 'DONE') { node.promisedAt = order.ceremonyTime; await this.nodes.save(node); }
        }
        await this.notify.toUser(order.ownerId, `订单 ${order.code} 仪式改期已确认:${order.ceremonyTime?.toLocaleString('zh-CN')}`, inc.orderId);
        break;
      }
      case IncidentType.TRAFFIC_DELAY: {
        if (meta.newPromisedAt) {
          const node = await this.nodes.findOne({ where: { orderId: inc.orderId, type: NodeType.PICKUP } });
          if (node && node.status !== 'DONE') { node.promisedAt = new Date(meta.newPromisedAt); await this.nodes.save(node); }
        }
        await this.notify.toUser(order.ownerId, `订单 ${order.code} 交通延误已处理,感谢理解`, inc.orderId);
        break;
      }
      case IncidentType.VIDEO_WITNESS: {
        await this.notify.toUser(order.ownerId, `订单 ${order.code} 视频见证已安排,火化环节将附视频材料`, inc.orderId);
        break;
      }
      case IncidentType.KEEPSAKE_FAILURE: {
        const job = await this.keepsakes.findOne({ where: { id: meta.jobId } });
        if (!job) throw new BadRequestException('纪念品工单不存在');
        if (dto.action === 'REMAKE') {
          job.status = KeepsakeStatus.REMAKING;
          job.attemptCount += 1;
          await this.keepsakes.save(job);
          await this.notify.toRole([Role.KEEPSAKE], `订单 ${order.code} 纪念品制作失败,需重新制作`, inc.orderId, order.storeId);
        } else if (dto.action === 'REFUND') {
          job.status = KeepsakeStatus.CANCELLED;
          await this.keepsakes.save(job);
          await this.fees.save(this.fees.create({
            orderId: inc.orderId, name: `纪念品制作失败退款(${job.type})`, amount: -Math.abs(Number(meta.refundAmount || 0)),
            category: FeeCategory.REFUND, incidentId: inc.id, createdById: user.id,
          }));
          await this.notify.toRole([Role.FINANCE], `订单 ${order.code} 纪念品退款 ¥${Math.abs(Number(meta.refundAmount || 0))},请审核`, inc.orderId, order.storeId);
        } else {
          throw new BadRequestException('action 须为 REMAKE 或 REFUND');
        }
        await this.notify.toUser(order.ownerId, `订单 ${order.code} 纪念品制作异常已处理:${dto.action === 'REMAKE' ? '安排重新制作' : '办理退款'}`, inc.orderId);
        break;
      }
      case IncidentType.SHIPPING_DAMAGE: {
        const comp = Math.abs(Number(meta.compensation || 0));
        if (comp > 0) {
          await this.fees.save(this.fees.create({
            orderId: inc.orderId, name: '骨灰盒寄送破损赔付', amount: -comp,
            category: FeeCategory.COMPENSATION, incidentId: inc.id, createdById: user.id,
          }));
        }
        const ship = await this.shipments.findOne({ where: { orderId: inc.orderId } });
        if (ship) { ship.status = ShipmentStatus.DAMAGED; await this.shipments.save(ship); }
        await this.notify.toRole([Role.FINANCE], `订单 ${order.code} 寄送破损赔付 ¥${comp},请审核`, inc.orderId, order.storeId);
        await this.notify.toUser(order.ownerId, `订单 ${order.code} 寄送破损已受理,赔付 ¥${comp},我们将重新安排寄送`, inc.orderId);
        break;
      }
      case IncidentType.STORAGE_EXPIRED: {
        await this.followUps.save(this.followUps.create({
          orderId: inc.orderId, type: FollowUpType.STORAGE_EXPIRY, scheduledAt: new Date(), assigneeId: user.id,
        }));
        await this.notify.toUser(order.ownerId, `订单 ${order.code} 骨灰寄存已到期,请及时续费或办理取回`, inc.orderId);
        break;
      }
    }

    inc.status = IncidentStatus.RESOLVED;
    inc.handledById = user.id;
    inc.resolution = dto.resolution || '';
    inc.meta = meta;
    inc.resolvedAt = new Date();
    await this.incidents.save(inc);
    return this.ordersService.detail(inc.orderId);
  }

  private async mustGet(id: number) {
    const i = await this.incidents.findOne({ where: { id } });
    if (!i) throw new NotFoundException('工单不存在');
    return i;
  }
}

@Controller('api')
@UseGuards(JwtGuard, RolesGuard)
export class IncidentsController {
  constructor(private svc: IncidentsService) {}

  @Post('orders/:orderId/incidents')
  create(@CurrentUser() u: AuthUser, @Param('orderId', ParseIntPipe) orderId: number, @Body() dto: any) {
    return this.svc.create(u, orderId, dto);
  }

  @Get('incidents')
  list(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.list(u, q); }

  @Post('incidents/:id/claim')
  claim(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.claim(u, id); }

  @Post('incidents/:id/resolve')
  resolve(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) { return this.svc.resolve(u, id, dto || {}); }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Incident, ServiceOrder, OrderNode, FeeItem, KeepsakeJob, Shipment, StorageRecord, FollowUp, User]),
    CommonModule, OrdersModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
