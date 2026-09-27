import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import {
  StorageCabinet, StorageRecord, ServiceOrder, FeeItem, Incident, FollowUp, User, Store,
  CabinetStatus, StorageStatus, FeeCategory, IncidentType, IncidentStatus, FollowUpType, Role,
} from '../entities';
import { JwtGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../auth';
import { NotifyService } from './common.module';
import { CommonModule } from './common.module';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Injectable()
export class StorageService {
  constructor(
    @InjectRepository(StorageCabinet) private cabinets: Repository<StorageCabinet>,
    @InjectRepository(StorageRecord) private records: Repository<StorageRecord>,
    @InjectRepository(ServiceOrder) private orders: Repository<ServiceOrder>,
    @InjectRepository(FeeItem) private fees: Repository<FeeItem>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(FollowUp) private followUps: Repository<FollowUp>,
    @InjectRepository(Store) private stores: Repository<Store>,
    private notify: NotifyService,
  ) {}

  /** 惰性检查寄存到期: 标记 EXPIRED + 生成异常工单与回访 */
  async checkExpiries() {
    const today = todayStr();
    const expired = await this.records.find({ where: { status: StorageStatus.ACTIVE, endDate: LessThan(today) } });
    for (const rec of expired) {
      rec.status = StorageStatus.EXPIRED;
      await this.records.save(rec);
      const order = await this.orders.findOne({ where: { id: rec.orderId } });
      if (!order) continue;
      const dup = await this.incidents.findOne({ where: { orderId: rec.orderId, type: IncidentType.STORAGE_EXPIRED, status: IncidentStatus.OPEN } });
      if (!dup) {
        await this.incidents.save(this.incidents.create({
          orderId: rec.orderId, type: IncidentType.STORAGE_EXPIRED,
          title: '寄存到期未续费', description: `柜位 ${rec.positionDesc} 已于 ${rec.endDate} 到期`,
          createdById: order.ownerId, meta: { storageRecordId: rec.id, endDate: rec.endDate },
        }));
      }
      await this.followUps.save(this.followUps.create({
        orderId: rec.orderId, type: FollowUpType.STORAGE_EXPIRY, scheduledAt: new Date(),
      }));
      await this.notify.toUser(order.ownerId, `订单 ${order.code} 的骨灰寄存已于 ${rec.endDate} 到期,请及时续费或取回`, rec.orderId);
      await this.notify.toRole([Role.CS], `订单 ${order.code} 寄存到期未续费,请跟进家属`, rec.orderId, order.storeId);
    }
    return expired.length;
  }

  async listCabinets(user: AuthUser, storeId?: number) {
    const sid = storeId || user.storeId;
    const where: any = sid ? { storeId: sid } : {};
    const cabinets = await this.cabinets.find({ where, order: { code: 'ASC' } });
    const stores = await this.stores.find();
    return cabinets.map(c => ({ ...c, store: stores.find(s => s.id === c.storeId) || null }));
  }

  async createCabinet(user: AuthUser, dto: any) {
    const storeId = dto.storeId || user.storeId;
    if (!storeId || !dto.code) throw new BadRequestException('请填写门店与柜位编号');
    const dup = await this.cabinets.findOne({ where: { storeId, code: dto.code } });
    if (dup) throw new BadRequestException('该柜位编号已存在');
    return this.cabinets.save(this.cabinets.create({
      storeId, code: dto.code, level: dto.level || 1, annualFee: dto.annualFee || 365,
    }));
  }

  /** 分配柜位: 生成寄存记录 + 年费账单 */
  async assign(user: AuthUser, orderId: number, dto: any) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    const exist = await this.records.findOne({ where: { orderId } });
    if (exist) throw new BadRequestException('该订单已分配寄存柜位');
    const cabinet = await this.cabinets.findOne({ where: { id: dto.cabinetId } });
    if (!cabinet) throw new NotFoundException('柜位不存在');
    if (cabinet.status !== CabinetStatus.FREE) throw new BadRequestException('该柜位不可用');
    const months = Number(dto.months || order.storageMonths || 12);
    const start = dto.startDate || todayStr();
    const end = addMonths(start, months);
    const store = await this.stores.findOne({ where: { id: cabinet.storeId } });
    const yearlyFee = Number(cabinet.annualFee);
    const totalFee = Math.round((yearlyFee * months) / 12 * 100) / 100;
    const rec = await this.records.save(this.records.create({
      orderId, cabinetId: cabinet.id, storeId: cabinet.storeId,
      positionDesc: `${store?.name || ''} ${cabinet.code}(${cabinet.level}层)`,
      startDate: start, endDate: end, yearlyFee,
    }));
    cabinet.status = CabinetStatus.OCCUPIED;
    await this.cabinets.save(cabinet);
    await this.fees.save(this.fees.create({
      orderId, name: `寄存年费 ${start} ~ ${end}(${months}个月)`, amount: totalFee,
      category: FeeCategory.STORAGE_FEE, createdById: user.id,
    }));
    // 寄存到期前 30 天提醒回访
    const remindAt = new Date(end + 'T00:00:00');
    remindAt.setDate(remindAt.getDate() - 30);
    await this.followUps.save(this.followUps.create({
      orderId, type: FollowUpType.ANNUAL_FEE, scheduledAt: remindAt, assigneeId: user.id,
    }));
    await this.notify.toRole([Role.FINANCE], `订单 ${order.code} 产生寄存年费 ¥${totalFee},请审核`, orderId, order.storeId);
    await this.notify.toUser(order.ownerId, `订单 ${order.code} 骨灰已寄存于 ${rec.positionDesc},期限至 ${end}`, orderId);
    return rec;
  }

  /** 续费 */
  async renew(user: AuthUser, recordId: number, dto: any) {
    const rec = await this.mustRecord(recordId);
    if (rec.status === StorageStatus.WITHDRAWN) throw new BadRequestException('该寄存已取回');
    const months = Number(dto.months || 12);
    const base = rec.status === StorageStatus.EXPIRED ? todayStr() : rec.endDate;
    rec.endDate = addMonths(base, months);
    rec.status = StorageStatus.ACTIVE;
    rec.renewCount += 1;
    await this.records.save(rec);
    const fee = Math.round((Number(rec.yearlyFee) * months) / 12 * 100) / 100;
    await this.fees.save(this.fees.create({
      orderId: rec.orderId, name: `寄存续费 ${months}个月(至 ${rec.endDate})`, amount: fee,
      category: FeeCategory.STORAGE_FEE, createdById: user.id,
    }));
    // 关闭未处理的到期工单
    const opens = await this.incidents.find({ where: { orderId: rec.orderId, type: IncidentType.STORAGE_EXPIRED, status: IncidentStatus.OPEN } });
    for (const inc of opens) {
      inc.status = IncidentStatus.RESOLVED;
      inc.resolution = `家属已续费至 ${rec.endDate}`;
      inc.resolvedAt = new Date();
      await this.incidents.save(inc);
    }
    const order = await this.orders.findOne({ where: { id: rec.orderId } });
    await this.notify.toRole([Role.FINANCE], `订单 ${order?.code} 寄存续费 ¥${fee},请审核`, rec.orderId, order?.storeId);
    return rec;
  }

  /** 取回(终止寄存) */
  async withdraw(user: AuthUser, recordId: number) {
    const rec = await this.mustRecord(recordId);
    if (rec.status === StorageStatus.WITHDRAWN) throw new BadRequestException('已取回');
    rec.status = StorageStatus.WITHDRAWN;
    await this.records.save(rec);
    const cabinet = await this.cabinets.findOne({ where: { id: rec.cabinetId } });
    if (cabinet) { cabinet.status = CabinetStatus.FREE; await this.cabinets.save(cabinet); }
    const order = await this.orders.findOne({ where: { id: rec.orderId } });
    await this.notify.toUser(order.ownerId, `订单 ${order.code} 骨灰已从 ${rec.positionDesc} 取回,寄存服务结束`, rec.orderId);
    return rec;
  }

  async listRecords(user: AuthUser, storeId?: number) {
    await this.checkExpiries();
    const sid = storeId || user.storeId;
    const where: any = sid ? { storeId: sid } : {};
    const records = await this.records.find({ where, order: { id: 'DESC' } });
    if (!records.length) return [];
    const orders = await this.orders.find({ where: { id: In(records.map(r => r.orderId)) } });
    const cabinets = await this.cabinets.find({ where: { id: In(records.map(r => r.cabinetId)) } });
    return records.map(r => ({
      ...r,
      order: orders.find(o => o.id === r.orderId) || null,
      cabinet: cabinets.find(c => c.id === r.cabinetId) || null,
    }));
  }

  private async mustRecord(id: number) {
    const r = await this.records.findOne({ where: { id } });
    if (!r) throw new NotFoundException('寄存记录不存在');
    return r;
  }
}

@Controller('api')
@UseGuards(JwtGuard, RolesGuard)
export class StorageController {
  constructor(private svc: StorageService) {}

  @Get('cabinets')
  cabinets(@CurrentUser() u: AuthUser, @Query('storeId') storeId?: string) {
    return this.svc.listCabinets(u, storeId ? +storeId : undefined);
  }

  @Post('cabinets')
  @Roles(Role.CS, Role.MANAGER)
  createCabinet(@CurrentUser() u: AuthUser, @Body() dto: any) { return this.svc.createCabinet(u, dto); }

  @Post('orders/:orderId/storage/assign')
  @Roles(Role.CS, Role.MANAGER)
  assign(@CurrentUser() u: AuthUser, @Param('orderId', ParseIntPipe) orderId: number, @Body() dto: any) {
    return this.svc.assign(u, orderId, dto);
  }

  @Get('storage-records')
  records(@CurrentUser() u: AuthUser, @Query('storeId') storeId?: string) {
    return this.svc.listRecords(u, storeId ? +storeId : undefined);
  }

  @Post('storage-records/:id/renew')
  renew(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.renew(u, id, dto || {});
  }

  @Post('storage-records/:id/withdraw')
  @Roles(Role.CS, Role.MANAGER, Role.OWNER)
  withdraw(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.withdraw(u, id); }

  @Post('storage/check-expiry')
  @Roles(Role.CS, Role.MANAGER)
  checkExpiry() { return this.svc.checkExpiries(); }
}

@Module({
  imports: [TypeOrmModule.forFeature([StorageCabinet, StorageRecord, ServiceOrder, FeeItem, Incident, FollowUp, User, Store]), CommonModule],
  controllers: [StorageController],
  providers: [StorageService],
})
export class StorageModule {}
