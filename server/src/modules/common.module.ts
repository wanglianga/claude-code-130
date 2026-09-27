import { Global, Module, Injectable } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification, User, Role, ServiceOrder, Pet, Store, Hospital } from '../entities';

@Injectable()
export class NotifyService {
  constructor(
    @InjectRepository(Notification) private notifications: Repository<Notification>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  async toUser(userId: number, content: string, orderId?: number) {
    await this.notifications.save(this.notifications.create({ userId, content, orderId: orderId ?? null }));
  }

  async toRole(roles: Role[], content: string, orderId?: number, storeId?: number) {
    const where: any = { role: In(roles) };
    const users = await this.users.find({ where });
    for (const u of users) {
      if (storeId != null && u.storeId != null && u.storeId !== storeId && u.role !== Role.MANAGER) continue;
      await this.toUser(u.id, content, orderId);
    }
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  providers: [NotifyService],
  exports: [NotifyService, TypeOrmModule],
})
export class CommonModule {}
