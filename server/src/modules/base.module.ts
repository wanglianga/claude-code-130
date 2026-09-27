import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Store, Hospital, Pet, AlbumPhoto, Notification, User, ServiceOrder, Role,
} from '../entities';
import { JwtGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../auth';
import { CommonModule } from './common.module';

@Controller('api')
@UseGuards(JwtGuard, RolesGuard)
export class BaseController {
  constructor(
    @InjectRepository(Store) private stores: Repository<Store>,
    @InjectRepository(Hospital) private hospitals: Repository<Hospital>,
    @InjectRepository(Pet) private pets: Repository<Pet>,
    @InjectRepository(AlbumPhoto) private album: Repository<AlbumPhoto>,
    @InjectRepository(Notification) private notifications: Repository<Notification>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(ServiceOrder) private orders: Repository<ServiceOrder>,
  ) {}

  @Get('stores')
  listStores() { return this.stores.find(); }

  @Get('hospitals')
  listHospitals() { return this.hospitals.find(); }

  /** 可调度员工列表(按角色/门店) */
  @Get('staff')
  @Roles(Role.CS, Role.MANAGER)
  async listStaff(@Query('storeId') storeId?: string) {
    const where: any = { role: In([Role.PICKUP, Role.CEREMONY, Role.CREMATOR, Role.KEEPSAKE, Role.CS]) };
    const staff = await this.users.find({ where });
    return staff
      .filter(s => !storeId || s.storeId === +storeId || s.storeId == null)
      .map(s => ({ id: s.id, name: s.name, role: s.role, storeId: s.storeId }));
  }

  @Get('pets/my')
  @Roles(Role.OWNER)
  myPets(@CurrentUser() u: AuthUser) { return this.pets.find({ where: { ownerId: u.id } }); }

  @Get('pets/:id/album')
  async getAlbum(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const pet = await this.pets.findOne({ where: { id } });
    if (!pet) throw new NotFoundException('宠物不存在');
    if (u.role === Role.OWNER && pet.ownerId !== u.id) throw new ForbiddenException('无权查看');
    const photos = await this.album.find({ where: { petId: id }, order: { id: 'DESC' } });
    return { pet, photos };
  }

  @Post('pets/:id/album')
  async addPhoto(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    const pet = await this.pets.findOne({ where: { id } });
    if (!pet) throw new NotFoundException('宠物不存在');
    if (u.role === Role.OWNER && pet.ownerId !== u.id) throw new ForbiddenException('无权操作');
    if (!dto.url) throw new BadRequestException('请填写照片地址');
    return this.album.save(this.album.create({
      petId: id, url: dto.url, caption: dto.caption || '', uploadedById: u.id, orderId: dto.orderId || null,
    }));
  }

  @Get('notifications/my')
  async myNotifications(@CurrentUser() u: AuthUser) {
    const list = await this.notifications.find({ where: { userId: u.id }, order: { id: 'DESC' }, take: 50 });
    const unread = await this.notifications.count({ where: { userId: u.id, read: false } });
    return { list, unread };
  }

  @Post('notifications/:id/read')
  async readNotification(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.notifications.update({ id, userId: u.id }, { read: true });
    return { ok: true };
  }

  @Post('notifications/read-all')
  async readAll(@CurrentUser() u: AuthUser) {
    await this.notifications.update({ userId: u.id, read: false }, { read: true });
    return { ok: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Store, Hospital, Pet, AlbumPhoto, Notification, User, ServiceOrder]), CommonModule],
  controllers: [BaseController],
})
export class BaseModule {}
