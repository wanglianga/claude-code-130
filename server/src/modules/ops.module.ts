import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import {
  KeepsakeJob, Shipment, FollowUp, ServiceOrder, Incident, User, Pet,
  KeepsakeStatus, ShipmentStatus, IncidentType, FollowUpStatus, Role,
} from '../entities';
import { JwtGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../auth';
import { NotifyService } from './common.module';
import { CommonModule } from './common.module';

export const KEEPSAKE_TYPE_NAMES: Record<string, string> = {
  PAW_PRINT: '爪印毛发纪念', PHOTO_VIDEO: '照片视频纪念', URN: '骨灰盒定制',
};
export const FOLLOWUP_TYPE_NAMES: Record<string, string> = {
  COMFORT: '情绪安抚回访', STORAGE_EXPIRY: '寄存到期跟进', KEEPSAKE_STATUS: '纪念品进度沟通',
  ANNUAL_FEE: '寄存年费提醒', SERVICE_REVIEW: '服务回访',
};

@Injectable()
export class OpsService {
  constructor(
    @InjectRepository(KeepsakeJob) private keepsakes: Repository<KeepsakeJob>,
    @InjectRepository(Shipment) private shipments: Repository<Shipment>,
    @InjectRepository(FollowUp) private followUps: Repository<FollowUp>,
    @InjectRepository(ServiceOrder) private orders: Repository<ServiceOrder>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(Pet) private pets: Repository<Pet>,
    private notify: NotifyService,
  ) {}

  // ---------- 纪念品 ----------
  async myKeepsakes(user: AuthUser) {
    let jobs: KeepsakeJob[];
    if (user.role === Role.MANAGER || user.role === Role.CS) {
      jobs = await this.keepsakes.find({ order: { id: 'DESC' }, take: 100 });
    } else {
      // 制作人员可见: 分配给我的 + 未认领排队中的
      jobs = await this.keepsakes.find({
        where: [{ assigneeId: user.id }, { assigneeId: IsNull() }],
        order: { id: 'DESC' }, take: 100,
      });
    }
    if (!jobs.length) return [];
    const orders = await this.orders.find({ where: { id: In(jobs.map(j => j.orderId)) } });
    return jobs.map(j => ({ ...j, typeName: KEEPSAKE_TYPE_NAMES[j.type] || j.type, order: orders.find(o => o.id === j.orderId) || null }));
  }

  async claimKeepsake(user: AuthUser, id: number) {
    const job = await this.mustKeepsake(id);
    job.assigneeId = user.id;
    if (job.status === KeepsakeStatus.QUEUED) job.status = KeepsakeStatus.MAKING;
    await this.keepsakes.save(job);
    return job;
  }

  async updateKeepsake(user: AuthUser, id: number, dto: any) {
    const job = await this.mustKeepsake(id);
    if (user.role === Role.KEEPSAKE && job.assigneeId && job.assigneeId !== user.id) {
      throw new ForbiddenException('该工单由其他同事负责');
    }
    const order = await this.orders.findOne({ where: { id: job.orderId } });
    if (dto.status === 'MAKING') {
      if (![KeepsakeStatus.QUEUED, KeepsakeStatus.REMAKING].includes(job.status)) throw new BadRequestException('当前状态不可开始制作');
      job.status = KeepsakeStatus.MAKING;
      if (!job.assigneeId) job.assigneeId = user.id;
    } else if (dto.status === 'DONE') {
      job.status = KeepsakeStatus.DONE;
      job.completedAt = new Date();
      await this.notify.toUser(order.ownerId, `订单 ${order.code} 的${KEEPSAKE_TYPE_NAMES[job.type] || '纪念品'}已制作完成`, job.orderId);
    } else if (dto.status === 'FAILED') {
      job.status = KeepsakeStatus.FAILED;
      job.failReason = dto.failReason || '制作失败';
      // 自动生成异常工单 + 回访节奏调整
      await this.incidents.save(this.incidents.create({
        orderId: job.orderId, type: IncidentType.KEEPSAKE_FAILURE,
        title: `${KEEPSAKE_TYPE_NAMES[job.type] || '纪念品'}制作失败`,
        description: job.failReason, createdById: user.id,
        meta: { jobId: job.id, jobType: job.type, attempt: job.attemptCount },
      }));
      await this.followUps.save(this.followUps.create({
        orderId: job.orderId, type: 'KEEPSAKE_STATUS' as any, scheduledAt: new Date(Date.now() + 86400000),
      }));
      await this.notify.toRole([Role.CS], `订单 ${order.code} ${KEEPSAKE_TYPE_NAMES[job.type]}制作失败:${job.failReason},请及时与家属沟通`, job.orderId, order.storeId);
    } else {
      throw new BadRequestException('不支持的状态');
    }
    await this.keepsakes.save(job);
    return job;
  }

  // ---------- 寄送 ----------
  async createShipment(user: AuthUser, orderId: number, dto: any) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    const exist = await this.shipments.findOne({ where: { orderId } });
    if (exist) throw new BadRequestException('该订单已创建寄送单');
    if (!dto.carrier || !dto.trackingNo) throw new BadRequestException('请填写承运商与运单号');
    const ship = await this.shipments.save(this.shipments.create({
      orderId, carrier: dto.carrier, trackingNo: dto.trackingNo,
      receiverAddress: dto.receiverAddress || order.pickupAddress || '',
      status: ShipmentStatus.SHIPPED, shippedAt: new Date(),
    }));
    await this.notify.toUser(order.ownerId, `订单 ${order.code} 骨灰盒已寄出:${dto.carrier} 单号 ${dto.trackingNo}`, orderId);
    return ship;
  }

  async updateShipment(user: AuthUser, id: number, dto: any) {
    const ship = await this.shipments.findOne({ where: { id } });
    if (!ship) throw new NotFoundException('寄送单不存在');
    const order = await this.orders.findOne({ where: { id: ship.orderId } });
    if (dto.status === 'DELIVERED') {
      ship.status = ShipmentStatus.DELIVERED;
      ship.deliveredAt = new Date();
      await this.notify.toUser(order.ownerId, `订单 ${order.code} 寄送已签收,请检查骨灰盒是否完好`, ship.orderId);
    } else if (dto.status === 'DAMAGED') {
      ship.status = ShipmentStatus.DAMAGED;
      await this.incidents.save(this.incidents.create({
        orderId: ship.orderId, type: IncidentType.SHIPPING_DAMAGE,
        title: '骨灰盒寄送破损', description: dto.description || '家属反馈收到骨灰盒破损',
        createdById: user.id, meta: { trackingNo: ship.trackingNo },
      }));
      await this.notify.toRole([Role.CS, Role.MANAGER], `订单 ${order.code} 寄送破损,请处理赔付与重新寄送`, ship.orderId, order.storeId);
    } else {
      throw new BadRequestException('不支持的状态');
    }
    await this.shipments.save(ship);
    return ship;
  }

  // ---------- 回访 ----------
  async listFollowUps(user: AuthUser, query: any) {
    const qb = this.followUps.createQueryBuilder('f').orderBy('f.scheduledAt', 'ASC');
    if (user.role === Role.CS && !query.all) {
      qb.where('(f.assigneeId = :uid OR f.assigneeId IS NULL)', { uid: user.id });
    }
    if (query.status) qb.andWhere('f.status = :st', { st: query.status });
    if (query.orderId) qb.andWhere('f.orderId = :oid', { oid: query.orderId });
    const list = await qb.take(300).getMany();
    if (!list.length) return [];
    const orders = await this.orders.find({ where: { id: In(list.map(f => f.orderId)) } });
    const pets = await this.pets.find({ where: { id: In(orders.map(o => o.petId)) } });
    return list.map(f => {
      const o = orders.find(x => x.id === f.orderId);
      return {
        ...f, typeName: FOLLOWUP_TYPE_NAMES[f.type] || f.type,
        order: o || null, pet: o ? pets.find(p => p.id === o.petId) || null : null,
      };
    });
  }

  async createFollowUp(user: AuthUser, orderId: number, dto: any) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (!dto.type || !dto.scheduledAt) throw new BadRequestException('请填写回访类型与时间');
    return this.followUps.save(this.followUps.create({
      orderId, type: dto.type, scheduledAt: new Date(dto.scheduledAt),
      assigneeId: dto.assigneeId || user.id,
    }));
  }

  async completeFollowUp(user: AuthUser, id: number, dto: any) {
    const f = await this.followUps.findOne({ where: { id } });
    if (!f) throw new NotFoundException('回访任务不存在');
    if (f.status === FollowUpStatus.DONE) throw new BadRequestException('该回访已完成');
    f.status = FollowUpStatus.DONE;
    f.completedAt = new Date();
    f.summary = dto.summary || '';
    f.ownerMood = dto.ownerMood || null;
    f.assigneeId = f.assigneeId || user.id;
    if (dto.nextFollowUpAt) {
      f.nextFollowUpAt = new Date(dto.nextFollowUpAt);
      await this.followUps.save(this.followUps.create({
        orderId: f.orderId, type: f.type, scheduledAt: f.nextFollowUpAt, assigneeId: f.assigneeId,
      }));
    }
    await this.followUps.save(f);
    return f;
  }

  private async mustKeepsake(id: number) {
    const j = await this.keepsakes.findOne({ where: { id } });
    if (!j) throw new NotFoundException('纪念品工单不存在');
    return j;
  }
}

@Controller('api')
@UseGuards(JwtGuard, RolesGuard)
export class OpsController {
  constructor(private svc: OpsService) {}

  @Get('keepsakes')
  @Roles(Role.KEEPSAKE, Role.CS, Role.MANAGER)
  myKeepsakes(@CurrentUser() u: AuthUser) { return this.svc.myKeepsakes(u); }

  @Post('keepsakes/:id/claim')
  @Roles(Role.KEEPSAKE, Role.CS, Role.MANAGER)
  claimKeepsake(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.claimKeepsake(u, id); }

  @Post('keepsakes/:id/status')
  @Roles(Role.KEEPSAKE, Role.CS, Role.MANAGER)
  updateKeepsake(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateKeepsake(u, id, dto || {});
  }

  @Post('orders/:orderId/shipment')
  @Roles(Role.CS, Role.MANAGER)
  createShipment(@CurrentUser() u: AuthUser, @Param('orderId', ParseIntPipe) orderId: number, @Body() dto: any) {
    return this.svc.createShipment(u, orderId, dto);
  }

  @Post('shipments/:id/status')
  @Roles(Role.CS, Role.MANAGER, Role.OWNER)
  updateShipment(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateShipment(u, id, dto || {});
  }

  @Get('follow-ups')
  listFollowUps(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.listFollowUps(u, q); }

  @Post('orders/:orderId/follow-ups')
  @Roles(Role.CS, Role.MANAGER)
  createFollowUp(@CurrentUser() u: AuthUser, @Param('orderId', ParseIntPipe) orderId: number, @Body() dto: any) {
    return this.svc.createFollowUp(u, orderId, dto);
  }

  @Post('follow-ups/:id/complete')
  @Roles(Role.CS, Role.MANAGER)
  completeFollowUp(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.completeFollowUp(u, id, dto || {});
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([KeepsakeJob, Shipment, FollowUp, ServiceOrder, Incident, User, Pet]), CommonModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
