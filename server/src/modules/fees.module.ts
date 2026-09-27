import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  FeeItem, ServiceOrder, User, FeeStatus, FeeCategory, Role,
} from '../entities';
import { JwtGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../auth';
import { NotifyService } from './common.module';
import { CommonModule } from './common.module';

export const FEE_CATEGORY_NAMES: Record<string, string> = {
  BASE: '基础服务费', ADDON: '增值服务', ADJUSTMENT: '费用调整',
  COMPENSATION: '赔付', REFUND: '退款', STORAGE_FEE: '寄存年费',
};

@Injectable()
export class FeesService {
  constructor(
    @InjectRepository(FeeItem) private fees: Repository<FeeItem>,
    @InjectRepository(ServiceOrder) private orders: Repository<ServiceOrder>,
    private notify: NotifyService,
  ) {}

  async listByOrder(orderId: number) {
    return this.fees.find({ where: { orderId }, order: { id: 'ASC' } });
  }

  async create(user: AuthUser, orderId: number, dto: any) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (!dto.name || dto.amount == null || isNaN(Number(dto.amount))) throw new BadRequestException('请填写费用名称与金额');
    const fee = await this.fees.save(this.fees.create({
      orderId, name: dto.name, amount: Number(dto.amount),
      category: dto.category || FeeCategory.ADDON, createdById: user.id,
      incidentId: dto.incidentId || null,
    }));
    await this.notify.toRole([Role.FINANCE], `订单 ${order.code} 新增费用项「${fee.name}」¥${fee.amount},待审核`, orderId, order.storeId);
    return fee;
  }

  /** 财务确认费用项 */
  async confirm(user: AuthUser, feeId: number) {
    const fee = await this.mustGet(feeId);
    if (fee.status !== FeeStatus.PENDING) throw new BadRequestException('该费用项已处理');
    fee.status = Number(fee.amount) < 0 ? FeeStatus.SETTLED : FeeStatus.CONFIRMED;
    fee.confirmedById = user.id;
    fee.confirmedAt = new Date();
    await this.fees.save(fee);
    const order = await this.orders.findOne({ where: { id: fee.orderId } });
    if (Number(fee.amount) > 0) {
      await this.notify.toUser(order.ownerId, `订单 ${order.code} 费用项「${fee.name}」¥${fee.amount} 已确认,请支付`, fee.orderId);
    }
    return fee;
  }

  /** 主人支付(模拟) */
  async pay(user: AuthUser, feeId: number) {
    const fee = await this.mustGet(feeId);
    const order = await this.orders.findOne({ where: { id: fee.orderId } });
    if (order.ownerId !== user.id) throw new ForbiddenException('无权操作');
    if (fee.status !== FeeStatus.CONFIRMED) throw new BadRequestException('该费用项待财务确认或已支付');
    if (Number(fee.amount) < 0) throw new BadRequestException('赔付款项无需支付');
    fee.status = FeeStatus.PAID;
    fee.paidAt = new Date();
    await this.fees.save(fee);
    await this.notify.toRole([Role.FINANCE], `订单 ${order.code} 费用项「${fee.name}」¥${fee.amount} 已支付`, fee.orderId, order.storeId);
    return fee;
  }

  /** 财务工作台: 待审核 + 全部费用变化 */
  async workbench(user: AuthUser, status?: string) {
    const qb = this.fees.createQueryBuilder('f').orderBy('f.id', 'DESC');
    if (status) qb.where('f.status = :st', { st: status });
    const list = await qb.take(300).getMany();
    if (!list.length) return [];
    const orders = await this.orders.find({ where: { id: In(list.map(f => f.orderId)) } });
    return list.map(f => ({ ...f, categoryName: FEE_CATEGORY_NAMES[f.category], order: orders.find(o => o.id === f.orderId) || null }));
  }

  private async mustGet(id: number) {
    const f = await this.fees.findOne({ where: { id } });
    if (!f) throw new NotFoundException('费用项不存在');
    return f;
  }
}

@Controller('api')
@UseGuards(JwtGuard, RolesGuard)
export class FeesController {
  constructor(private svc: FeesService) {}

  @Get('orders/:orderId/fees')
  listByOrder(@Param('orderId', ParseIntPipe) orderId: number) { return this.svc.listByOrder(orderId); }

  @Post('orders/:orderId/fees')
  @Roles(Role.CS, Role.FINANCE, Role.MANAGER)
  create(@CurrentUser() u: AuthUser, @Param('orderId', ParseIntPipe) orderId: number, @Body() dto: any) {
    return this.svc.create(u, orderId, dto);
  }

  @Post('fees/:id/confirm')
  @Roles(Role.FINANCE, Role.MANAGER)
  confirm(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.confirm(u, id); }

  @Post('fees/:id/pay')
  @Roles(Role.OWNER)
  pay(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.pay(u, id); }

  @Get('fees/workbench')
  @Roles(Role.FINANCE, Role.MANAGER)
  workbench(@CurrentUser() u: AuthUser, @Query('status') status?: string) { return this.svc.workbench(u, status); }
}

@Module({
  imports: [TypeOrmModule.forFeature([FeeItem, ServiceOrder, User]), CommonModule],
  controllers: [FeesController],
  providers: [FeesService],
})
export class FeesModule {}
