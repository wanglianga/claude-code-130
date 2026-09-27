import {
  BadRequestException, Controller, ForbiddenException, Get, Module, NotFoundException,
  Param, ParseIntPipe, Post, Body, Query, UseGuards,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
import { Injectable } from '@nestjs/common';
import {
  ServiceOrder, OrderNode, Pet, User, Store, Hospital, FeeItem, Incident, KeepsakeJob,
  StorageRecord, Shipment, FollowUp, AlbumPhoto,
  OrderStatus, NodeType, NodeStatus, Role, UrnType, HandoverMethod,
  IncidentType, IncidentStatus, FeeCategory, FeeStatus, KeepsakeStatus, FollowUpType, FollowUpStatus,
} from '../entities';
import { JwtGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../auth';
import { NotifyService } from './common.module';
import { CommonModule } from './common.module';

export const NODE_TYPE_NAMES: Record<string, string> = {
  CONFIRM: '方案确认', PICKUP: '上门接送', COLD_STORAGE: '冷藏暂存', CEREMONY: '告别仪式',
  CREMATION: '火化', KEEPSAKE: '纪念品制作', URN_HANDOVER: '骨灰交付', STORAGE: '骨灰寄存',
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(ServiceOrder) public orders: Repository<ServiceOrder>,
    @InjectRepository(OrderNode) public nodes: Repository<OrderNode>,
    @InjectRepository(Pet) public pets: Repository<Pet>,
    @InjectRepository(User) public users: Repository<User>,
    @InjectRepository(Store) public stores: Repository<Store>,
    @InjectRepository(Hospital) public hospitals: Repository<Hospital>,
    @InjectRepository(FeeItem) public fees: Repository<FeeItem>,
    @InjectRepository(Incident) public incidents: Repository<Incident>,
    @InjectRepository(KeepsakeJob) public keepsakes: Repository<KeepsakeJob>,
    @InjectRepository(StorageRecord) public storageRecords: Repository<StorageRecord>,
    @InjectRepository(Shipment) public shipments: Repository<Shipment>,
    @InjectRepository(FollowUp) public followUps: Repository<FollowUp>,
    private notify: NotifyService,
  ) {}

  async genCode(): Promise<string> {
    const today = new Date();
    const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const count = await this.orders.count();
    return `PM${ymd}-${String(count + 1).padStart(4, '0')}`;
  }

  async createOrder(owner: AuthUser, dto: any) {
    if (!dto.storeId) throw new BadRequestException('请选择服务门店');
    let petId = dto.petId;
    if (!petId) {
      const p = dto.pet || {};
      if (!p.name || !p.species) throw new BadRequestException('请填写宠物姓名与种类');
      if (!['CAT', 'DOG', 'RABBIT', 'EXOTIC'].includes(p.species)) throw new BadRequestException('宠物种类须为猫/犬/兔/异宠');
      const pet = await this.pets.save(this.pets.create({
        ownerId: owner.id, name: p.name, species: p.species, breed: p.breed || '',
        weightKg: p.weightKg || 0, deathTime: p.deathTime ? new Date(p.deathTime) : null,
        photoUrl: p.photoUrl || '', notes: p.notes || '',
      }));
      petId = pet.id;
    } else {
      const pet = await this.pets.findOne({ where: { id: petId } });
      if (!pet || pet.ownerId !== owner.id) throw new BadRequestException('宠物不存在');
    }
    const storageMonths = Number(dto.storageMonths || 0);
    let handoverMethod = dto.handoverMethod || (storageMonths > 0 ? HandoverMethod.STORAGE : HandoverMethod.SELF);
    if (storageMonths > 0) handoverMethod = HandoverMethod.STORAGE;
    const order = await this.orders.save(this.orders.create({
      code: await this.genCode(), petId, ownerId: owner.id, storeId: dto.storeId,
      hospitalId: dto.hospitalId || null,
      needPickup: !!dto.needPickup, pickupAddress: dto.pickupAddress || '',
      needCeremony: !!dto.needCeremony, individualCremation: dto.individualCremation !== false,
      urnType: dto.urnType || UrnType.NONE, needPawPrint: !!dto.needPawPrint,
      needPhotoVideo: !!dto.needPhotoVideo, storageMonths, handoverMethod,
      ceremonyTime: dto.ceremonyTime ? new Date(dto.ceremonyTime) : null,
      remark: dto.remark || '',
    }));
    await this.notify.toRole([Role.CS, Role.MANAGER], `新的善终服务申请 ${order.code},请确认服务方案`, order.id, order.storeId);
    return this.detail(order.id);
  }

  /** 客服确认方案: 报价 + 生成节点计划 + 费用项 + 纪念品工单 */
  async confirm(cs: AuthUser, orderId: number, dto: any) {
    const order = await this.mustGet(orderId);
    if (order.status !== OrderStatus.PENDING) throw new BadRequestException('订单当前状态不可确认');
    if (!(dto.quotedAmount > 0)) throw new BadRequestException('请填写报价金额');
    if (!(dto.quotedWeightKg > 0)) throw new BadRequestException('请填写报价体重');
    order.quotedAmount = dto.quotedAmount;
    order.quotedWeightKg = dto.quotedWeightKg;
    if (dto.ceremonyTime) order.ceremonyTime = new Date(dto.ceremonyTime);
    order.confirmedAt = new Date();
    order.status = OrderStatus.CONFIRMED;
    await this.orders.save(order);

    // 费用明细
    const feeList: any[] = Array.isArray(dto.fees) && dto.fees.length ? dto.fees : [{ name: '善终服务套餐', amount: dto.quotedAmount, category: FeeCategory.BASE }];
    for (const f of feeList) {
      await this.fees.save(this.fees.create({
        orderId: order.id, name: f.name || '服务费', amount: f.amount,
        category: f.category || FeeCategory.BASE, createdById: cs.id,
      }));
    }

    // 生成节点计划
    const plan: NodeType[] = [NodeType.CONFIRM];
    if (order.needPickup) plan.push(NodeType.PICKUP);
    plan.push(NodeType.COLD_STORAGE);
    if (order.needCeremony) plan.push(NodeType.CEREMONY);
    plan.push(NodeType.CREMATION);
    const needKeepsake = order.needPawPrint || order.needPhotoVideo || order.urnType !== UrnType.NONE;
    if (needKeepsake) plan.push(NodeType.KEEPSAKE);
    plan.push(NodeType.URN_HANDOVER);
    if (order.storageMonths > 0) plan.push(NodeType.STORAGE);
    let seq = 0;
    for (const t of plan) {
      const node = await this.nodes.save(this.nodes.create({
        orderId: order.id, type: t, seq: seq++, storeId: order.storeId,
        status: t === NodeType.CONFIRM ? NodeStatus.DONE : NodeStatus.PENDING,
        assigneeId: t === NodeType.CONFIRM ? cs.id : null,
        completedAt: t === NodeType.CONFIRM ? new Date() : null,
        promisedAt: t === NodeType.CEREMONY && order.ceremonyTime ? order.ceremonyTime : null,
      }));
      if (t === NodeType.KEEPSAKE) {
        const jobs: Array<[string, string]> = [];
        if (order.needPawPrint) jobs.push(['PAW_PRINT', '']);
        if (order.needPhotoVideo) jobs.push(['PHOTO_VIDEO', '']);
        if (order.urnType !== UrnType.NONE) jobs.push(['URN', '']);
        for (const [jt] of jobs) {
          await this.keepsakes.save(this.keepsakes.create({ orderId: order.id, type: jt }));
        }
      }
    }
    await this.notify.toUser(order.ownerId, `您的善终服务申请 ${order.code} 已确认方案,报价 ¥${dto.quotedAmount},请查看费用明细`, order.id);
    return this.detail(order.id);
  }

  /** 客服调度: 为节点分配人员与承诺时间 */
  async dispatch(cs: AuthUser, orderId: number, dto: any) {
    const order = await this.mustGet(orderId);
    if (![OrderStatus.CONFIRMED, OrderStatus.SCHEDULED].includes(order.status)) {
      throw new BadRequestException('订单须先确认方案后再调度');
    }
    const items: any[] = dto.nodes || [];
    if (!items.length) throw new BadRequestException('请至少调度一个节点');
    for (const it of items) {
      const node = await this.nodes.findOne({ where: { id: it.nodeId, orderId } });
      if (!node) throw new BadRequestException(`节点 ${it.nodeId} 不存在`);
      if ([NodeStatus.DONE, NodeStatus.SKIPPED].includes(node.status)) continue;
      if (it.assigneeId) {
        const staff = await this.users.findOne({ where: { id: it.assigneeId } });
        if (!staff) throw new BadRequestException('调度人员不存在');
        node.assigneeId = staff.id;
        node.status = NodeStatus.ASSIGNED;
        await this.notify.toUser(staff.id, `您有新的服务任务:订单 ${order.code} - ${NODE_TYPE_NAMES[node.type]},承诺完成时间 ${it.promisedAt ? new Date(it.promisedAt).toLocaleString('zh-CN') : '待定'}`, order.id);
      }
      if (it.promisedAt) node.promisedAt = new Date(it.promisedAt);
      await this.nodes.save(node);
    }
    if (order.status === OrderStatus.CONFIRMED) {
      order.status = OrderStatus.SCHEDULED;
      await this.orders.save(order);
    }
    await this.notify.toUser(order.ownerId, `订单 ${order.code} 已完成调度安排,各环节承诺时间已更新`, order.id);
    return this.detail(order.id);
  }

  async mustGet(id: number): Promise<ServiceOrder> {
    const o = await this.orders.findOne({ where: { id } });
    if (!o) throw new NotFoundException('订单不存在');
    return o;
  }

  async detail(id: number) {
    const order = await this.mustGet(id);
    const [pet, owner, store, hospital, nodes, fees, incidents, keepsakes, storage, shipment, followUps] = await Promise.all([
      this.pets.findOne({ where: { id: order.petId } }),
      this.users.findOne({ where: { id: order.ownerId } }),
      this.stores.findOne({ where: { id: order.storeId } }),
      order.hospitalId ? this.hospitals.findOne({ where: { id: order.hospitalId } }) : null,
      this.nodes.find({ where: { orderId: id }, order: { seq: 'ASC' } }),
      this.fees.find({ where: { orderId: id }, order: { id: 'ASC' } }),
      this.incidents.find({ where: { orderId: id }, order: { id: 'DESC' } }),
      this.keepsakes.find({ where: { orderId: id }, order: { id: 'ASC' } }),
      this.storageRecords.findOne({ where: { orderId: id } }),
      this.shipments.findOne({ where: { orderId: id } }),
      this.followUps.find({ where: { orderId: id }, order: { scheduledAt: 'ASC' } }),
    ]);
    const userIds = new Set<number>();
    nodes.forEach(n => n.assigneeId && userIds.add(n.assigneeId));
    incidents.forEach(i => { userIds.add(i.createdById); i.handledById && userIds.add(i.handledById); });
    fees.forEach(f => { userIds.add(f.createdById); f.confirmedById && userIds.add(f.confirmedById); });
    followUps.forEach(f => f.assigneeId && userIds.add(f.assigneeId));
    const us = userIds.size ? await this.users.find({ where: { id: In([...userIds]) } }) : [];
    const nameOf = (uid: number) => us.find(u => u.id === uid)?.name || (uid === owner?.id ? owner?.name : '') || `#${uid}`;
    return {
      order, pet, store, hospital,
      owner: owner ? { id: owner.id, name: owner.name, phone: owner.phone } : null,
      nodes: nodes.map(n => ({ ...n, assigneeName: n.assigneeId ? nameOf(n.assigneeId) : null, typeName: NODE_TYPE_NAMES[n.type] })),
      fees: fees.map(f => ({ ...f, createdByName: nameOf(f.createdById), confirmedByName: f.confirmedById ? nameOf(f.confirmedById) : null })),
      incidents: incidents.map(i => ({ ...i, createdByName: nameOf(i.createdById), handledByName: i.handledById ? nameOf(i.handledById) : null })),
      keepsakes, storage, shipment,
      followUps: followUps.map(f => ({ ...f, assigneeName: f.assigneeId ? nameOf(f.assigneeId) : null })),
    };
  }

  async listFor(user: AuthUser, query: any) {
    const qb = this.orders.createQueryBuilder('o').orderBy('o.id', 'DESC');
    if (user.role === Role.OWNER) qb.where('o.ownerId = :uid', { uid: user.id });
    else if (user.role === Role.MANAGER || user.role === Role.FINANCE) { /* 全部 */ }
    else if (user.storeId) qb.where('o.storeId = :sid', { sid: user.storeId });
    if (query.status) qb.andWhere('o.status = :st', { st: query.status });
    const orders = await qb.take(200).getMany();
    if (!orders.length) return [];
    const pets = await this.pets.find({ where: { id: In(orders.map(o => o.petId)) } });
    const stores = await this.stores.find();
    const owners = await this.users.find({ where: { id: In(orders.map(o => o.ownerId)) } });
    return orders.map(o => ({
      ...o,
      pet: pets.find(p => p.id === o.petId) || null,
      store: stores.find(s => s.id === o.storeId) || null,
      owner: owners.find(u => u.id === o.ownerId) ? { name: owners.find(u => u.id === o.ownerId).name } : null,
    }));
  }

  async cancel(user: AuthUser, orderId: number, reason: string) {
    const order = await this.mustGet(orderId);
    if (user.role === Role.OWNER && order.ownerId !== user.id) throw new ForbiddenException('无权操作');
    if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status)) {
      throw new BadRequestException('服务已开始,无法取消,请联系客服');
    }
    order.status = OrderStatus.CANCELLED;
    await this.orders.save(order);
    await this.nodes.update({ orderId, status: Not(In([NodeStatus.DONE])) }, { status: NodeStatus.SKIPPED });
    await this.notify.toRole([Role.CS, Role.MANAGER], `订单 ${order.code} 已取消${reason ? ':' + reason : ''}`, order.id, order.storeId);
    return this.detail(orderId);
  }

  /** 主人临时更改仪式时间 → 自动生成异常工单 */
  async rescheduleCeremony(owner: AuthUser, orderId: number, dto: any) {
    const order = await this.mustGet(orderId);
    if (order.ownerId !== owner.id) throw new ForbiddenException('无权操作');
    if (!dto.ceremonyTime) throw new BadRequestException('请选择新的仪式时间');
    const oldTime = order.ceremonyTime;
    order.ceremonyTime = new Date(dto.ceremonyTime);
    await this.orders.save(order);
    const ceremonyNode = await this.nodes.findOne({ where: { orderId, type: NodeType.CEREMONY } });
    if (ceremonyNode && ceremonyNode.status !== NodeStatus.DONE) {
      ceremonyNode.promisedAt = order.ceremonyTime;
      await this.nodes.save(ceremonyNode);
    }
    const incident = await this.incidents.save(this.incidents.create({
      orderId, type: IncidentType.CEREMONY_RESCHEDULE, title: '家属临时更改仪式时间',
      description: dto.reason || '家属申请调整告别仪式时间',
      createdById: owner.id, relatedNodeId: ceremonyNode?.id || null,
      meta: { oldTime, newTime: order.ceremonyTime },
    }));
    await this.notify.toRole([Role.CS], `订单 ${order.code} 仪式时间变更为 ${order.ceremonyTime.toLocaleString('zh-CN')},请协调礼仪师与告别室`, orderId, order.storeId);
    if (ceremonyNode?.assigneeId) {
      await this.notify.toUser(ceremonyNode.assigneeId, `订单 ${order.code} 仪式时间变更为 ${order.ceremonyTime.toLocaleString('zh-CN')}`, orderId);
    }
    return { incident, detail: await this.detail(orderId) };
  }
}

@Injectable()
export class NodesService {
  constructor(
    private ordersService: OrdersService,
    @InjectRepository(OrderNode) private nodes: Repository<OrderNode>,
    @InjectRepository(ServiceOrder) private orders: Repository<ServiceOrder>,
    @InjectRepository(KeepsakeJob) private keepsakes: Repository<KeepsakeJob>,
    @InjectRepository(StorageRecord) private storageRecords: Repository<StorageRecord>,
    @InjectRepository(Shipment) private shipments: Repository<Shipment>,
    @InjectRepository(FollowUp) private followUps: Repository<FollowUp>,
    @InjectRepository(User) private users: Repository<User>,
    private notify: NotifyService,
  ) {}

  private async mustNode(id: number) {
    const n = await this.nodes.findOne({ where: { id } });
    if (!n) throw new NotFoundException('节点不存在');
    return n;
  }

  private async checkPrev(node: OrderNode) {
    const prev = await this.nodes.find({ where: { orderId: node.orderId } });
    const blocking = prev.filter(p => p.seq < node.seq && ![NodeStatus.DONE, NodeStatus.SKIPPED].includes(p.status));
    if (blocking.length) {
      throw new BadRequestException(`请先完成前置环节: ${blocking.map(b => NODE_TYPE_NAMES[b.type]).join('、')}`);
    }
  }

  private canOperate(user: AuthUser, node: OrderNode) {
    if ([Role.MANAGER, Role.CS].includes(user.role)) return true;
    return node.assigneeId === user.id;
  }

  async start(user: AuthUser, nodeId: number) {
    const node = await this.mustNode(nodeId);
    if (!this.canOperate(user, node)) throw new ForbiddenException('仅负责人可操作该环节');
    if (![NodeStatus.ASSIGNED, NodeStatus.PENDING].includes(node.status)) throw new BadRequestException('该环节当前状态不可开始');
    await this.checkPrev(node);
    node.status = NodeStatus.IN_PROGRESS;
    node.startedAt = new Date();
    await this.nodes.save(node);
    const order = await this.orders.findOne({ where: { id: node.orderId } });
    if (order && [OrderStatus.SCHEDULED, OrderStatus.CONFIRMED].includes(order.status)) {
      order.status = OrderStatus.IN_PROGRESS;
      await this.orders.save(order);
    }
    return this.ordersService.detail(node.orderId);
  }

  async complete(user: AuthUser, nodeId: number, dto: any) {
    const node = await this.mustNode(nodeId);
    if (!this.canOperate(user, node)) throw new ForbiddenException('仅负责人可操作该环节');
    if ([NodeStatus.DONE, NodeStatus.SKIPPED].includes(node.status)) throw new BadRequestException('该环节已完成');
    await this.checkPrev(node);
    const order = await this.orders.findOne({ where: { id: node.orderId } });
    const evidence = Array.isArray(dto.evidence) ? dto.evidence : [];
    // 见证材料校验(敏感环节留痕)
    if (node.type === NodeType.PICKUP && !evidence.some(e => e.kind === 'PHOTO')) {
      throw new BadRequestException('接送交接须上传交接照片(PHOTO)');
    }
    if (node.type === NodeType.CREMATION && !evidence.some(e => e.kind === 'CERT')) {
      throw new BadRequestException('火化完成须上传火化证明(CERT)');
    }
    if (node.type === NodeType.KEEPSAKE) {
      const jobs = await this.keepsakes.find({ where: { orderId: node.orderId } });
      const open = jobs.filter(j => ![KeepsakeStatus.DONE, KeepsakeStatus.CANCELLED].includes(j.status));
      if (open.length) throw new BadRequestException('纪念品工单尚未全部完成,无法完成该环节');
    }
    if (node.type === NodeType.URN_HANDOVER) {
      if (order.handoverMethod === HandoverMethod.STORAGE) {
        const rec = await this.storageRecords.findOne({ where: { orderId: node.orderId } });
        if (!rec) throw new BadRequestException('请先在寄存管理中分配柜位后再完成交付');
        if (!evidence.some(e => e.kind === 'LOCATION')) evidence.push({ kind: 'LOCATION', note: rec.positionDesc, url: '' });
      } else if (order.handoverMethod === HandoverMethod.SHIPMENT) {
        const ship = await this.shipments.findOne({ where: { orderId: node.orderId } });
        if (!ship) throw new BadRequestException('请先创建寄送单后再完成交付');
        if (!evidence.some(e => e.kind === 'TRACKING')) evidence.push({ kind: 'TRACKING', note: `${ship.carrier} ${ship.trackingNo}`, url: '' });
      }
    }
    const stamped = evidence.map(e => ({ ...e, uploadedBy: user.name, uploadedAt: new Date().toISOString() }));
    node.evidence = [...(node.evidence || []), ...stamped];
    node.note = dto.note || node.note;
    node.status = NodeStatus.DONE;
    node.completedAt = new Date();
    if (!node.startedAt) node.startedAt = new Date();
    await this.nodes.save(node);

    // 骨灰交付完成 → 订单完成,自动生成回访计划
    if (node.type === NodeType.URN_HANDOVER) {
      // 寄存节点: 入柜即完成
      const storageNode = await this.nodes.findOne({ where: { orderId: node.orderId, type: NodeType.STORAGE } });
      if (storageNode && storageNode.status !== NodeStatus.DONE) {
        const rec = await this.storageRecords.findOne({ where: { orderId: node.orderId } });
        if (rec) {
          storageNode.status = NodeStatus.DONE;
          storageNode.completedAt = new Date();
          storageNode.evidence = [{ kind: 'LOCATION', note: rec.positionDesc, uploadedBy: user.name, uploadedAt: new Date().toISOString() }];
          await this.nodes.save(storageNode);
        }
      }
      order.status = OrderStatus.COMPLETED;
      order.completedAt = new Date();
      await this.orders.save(order);
      const cs = await this.users.find({ where: { role: Role.CS } });
      const csId = cs.find(c => c.storeId === order.storeId)?.id || cs[0]?.id || null;
      const inDays = (d: number) => new Date(Date.now() + d * 86400000);
      await this.followUps.save([
        this.followUps.create({ orderId: order.id, type: FollowUpType.COMFORT, scheduledAt: inDays(3), assigneeId: csId }),
        this.followUps.create({ orderId: order.id, type: FollowUpType.SERVICE_REVIEW, scheduledAt: inDays(7), assigneeId: csId }),
      ]);
      await this.notify.toUser(order.ownerId, `订单 ${order.code} 服务已完成,感谢您的信任。交接材料已归档,可随时查看`, order.id);
      await this.notify.toRole([Role.CS], `订单 ${order.code} 已完成,请按节奏进行情绪安抚回访`, order.id, order.storeId);
    } else {
      await this.notify.toUser(order.ownerId, `订单 ${order.code} 已完成「${NODE_TYPE_NAMES[node.type]}」环节`, order.id);
    }
    return this.ordersService.detail(node.orderId);
  }

  async addEvidence(user: AuthUser, nodeId: number, dto: any) {
    const node = await this.mustNode(nodeId);
    if (!this.canOperate(user, node)) throw new ForbiddenException('仅负责人可上传材料');
    const items = (Array.isArray(dto.evidence) ? dto.evidence : [dto]).filter(e => e && e.kind);
    if (!items.length) throw new BadRequestException('材料格式不正确');
    const stamped = items.map(e => ({ kind: e.kind, url: e.url || '', note: e.note || '', uploadedBy: user.name, uploadedAt: new Date().toISOString() }));
    node.evidence = [...(node.evidence || []), ...stamped];
    await this.nodes.save(node);
    return this.ordersService.detail(node.orderId);
  }

  async ownerConfirm(user: AuthUser, nodeId: number) {
    const node = await this.mustNode(nodeId);
    const order = await this.orders.findOne({ where: { id: node.orderId } });
    if (order.ownerId !== user.id) throw new ForbiddenException('无权操作');
    if (node.status !== NodeStatus.DONE) throw new BadRequestException('该环节尚未完成');
    node.ownerConfirmed = true;
    node.ownerConfirmedAt = new Date();
    await this.nodes.save(node);
    return this.ordersService.detail(node.orderId);
  }

  /** 员工任务列表: 分配给我的节点 */
  async myTasks(user: AuthUser) {
    const nodes = await this.nodes.find({
      where: { assigneeId: user.id, status: In([NodeStatus.ASSIGNED, NodeStatus.IN_PROGRESS, NodeStatus.BLOCKED]) },
      order: { promisedAt: 'ASC' },
    });
    if (!nodes.length) return [];
    const orders = await this.orders.find({ where: { id: In(nodes.map(n => n.orderId)) } });
    const pets = await this.ordersService.pets.find({ where: { id: In(orders.map(o => o.petId)) } });
    return nodes.map(n => {
      const o = orders.find(x => x.id === n.orderId);
      return { ...n, typeName: NODE_TYPE_NAMES[n.type], order: o, pet: pets.find(p => p.id === o?.petId) || null };
    });
  }
}

// ---------------- Controllers ----------------
@Controller('api/orders')
@UseGuards(JwtGuard, RolesGuard)
export class OrdersController {
  constructor(private svc: OrdersService) {}

  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() u: AuthUser, @Body() dto: any) { return this.svc.createOrder(u, dto); }

  @Get('my')
  @Roles(Role.OWNER)
  my(@CurrentUser() u: AuthUser) { return this.svc.listFor(u, {}); }

  @Get()
  @Roles(Role.CS, Role.MANAGER, Role.FINANCE, Role.PICKUP, Role.CEREMONY, Role.CREMATOR, Role.KEEPSAKE)
  list(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.listFor(u, q); }

  @Get(':id')
  async detail(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const d = await this.svc.detail(id);
    if (u.role === Role.OWNER && d.order.ownerId !== u.id) throw new ForbiddenException('无权查看');
    return d;
  }

  @Post(':id/confirm')
  @Roles(Role.CS, Role.MANAGER)
  confirm(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) { return this.svc.confirm(u, id, dto); }

  @Post(':id/dispatch')
  @Roles(Role.CS, Role.MANAGER)
  dispatch(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) { return this.svc.dispatch(u, id, dto); }

  @Post(':id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) { return this.svc.cancel(u, id, dto?.reason || ''); }

  @Post(':id/ceremony-time')
  @Roles(Role.OWNER)
  reschedule(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) { return this.svc.rescheduleCeremony(u, id, dto); }
}

@Controller('api/nodes')
@UseGuards(JwtGuard, RolesGuard)
export class NodesController {
  constructor(private svc: NodesService) {}

  @Get('my-tasks')
  myTasks(@CurrentUser() u: AuthUser) { return this.svc.myTasks(u); }

  @Post(':id/start')
  start(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.start(u, id); }

  @Post(':id/complete')
  complete(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) { return this.svc.complete(u, id, dto || {}); }

  @Post(':id/evidence')
  addEvidence(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) { return this.svc.addEvidence(u, id, dto); }

  @Post(':id/owner-confirm')
  @Roles(Role.OWNER)
  ownerConfirm(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.ownerConfirm(u, id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOrder, OrderNode, Pet, User, Store, Hospital, FeeItem, Incident, KeepsakeJob, StorageRecord, Shipment, FollowUp, AlbumPhoto]), CommonModule],
  controllers: [OrdersController, NodesController],
  providers: [OrdersService, NodesService],
  exports: [OrdersService, NodesService],
})
export class OrdersModule {}
