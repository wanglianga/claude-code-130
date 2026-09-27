import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { config } from './config';
import {
  ALL_ENTITIES, Store, Hospital, User, Pet, ServiceOrder, StorageCabinet,
  Role, Species, UrnType, HandoverMethod, CabinetStatus,
} from './entities';

async function seed() {
  const ds = new DataSource({
    type: 'mysql',
    host: config.db.host, port: config.db.port,
    username: config.db.username, password: config.db.password,
    database: config.db.database, entities: ALL_ENTITIES, synchronize: true, charset: 'utf8mb4',
  });
  await ds.initialize();
  console.log('connected, seeding...');

  const stores = ds.getRepository(Store);
  const hospitals = ds.getRepository(Hospital);
  const users = ds.getRepository(User);
  const pets = ds.getRepository(Pet);
  const orders = ds.getRepository(ServiceOrder);
  const cabinets = ds.getRepository(StorageCabinet);

  if (await users.count() > 0) {
    console.log('已有数据,跳过种子(如需重置请先清空数据库)');
    await ds.destroy();
    return;
  }

  // 门店
  const s1 = await stores.save(stores.create({ name: '安宁宠物善终·北京朝阳店', city: '北京', address: '北京市朝阳区望京南湖东园 12 号', phone: '010-64000001' }));
  const s2 = await stores.save(stores.create({ name: '安宁宠物善终·上海静安店', city: '上海', address: '上海市静安区昌平路 88 号', phone: '021-52000002' }));

  // 合作宠物医院(转介来源)
  await hospitals.save([
    hospitals.create({ name: '瑞鹏宠物医院(望京分院)', contactName: '刘医生', phone: '010-84710000', storeId: s1.id }),
    hospitals.create({ name: '芭比堂动物医院(静安店)', contactName: '王医生', phone: '021-62560000', storeId: s2.id }),
  ]);

  // 账号(密码均为 123456)
  const hash = bcrypt.hashSync('123456', 10);
  const mk = (username: string, name: string, role: Role, storeId: number | null, phone = '') =>
    users.create({ username, name, role, storeId, phone, passwordHash: hash });
  await users.save([
    mk('owner1', '陈静', Role.OWNER, null, '13800000001'),
    mk('owner2', '李远航', Role.OWNER, null, '13800000002'),
    mk('cs1', '周晓(客服)', Role.CS, s1.id, '13900000001'),
    mk('cs2', '吴敏(客服)', Role.CS, s2.id, '13900000002'),
    mk('pickup1', '郑师傅(接送)', Role.PICKUP, s1.id, '13700000001'),
    mk('ceremony1', '林礼仪(礼仪师)', Role.CEREMONY, s1.id, '13700000002'),
    mk('cremator1', '赵火化(火化师)', Role.CREMATOR, s1.id, '13700000003'),
    mk('keepsake1', '孙手艺(纪念品)', Role.KEEPSAKE, s1.id, '13700000004'),
    mk('finance1', '钱财务', Role.FINANCE, null, '13600000001'),
    mk('manager1', '王店长(管理者)', Role.MANAGER, null, '13500000001'),
  ]);

  // 寄存柜位
  const cab: Partial<StorageCabinet>[] = [];
  for (const [sid, prefix] of [[s1.id, 'BJ-A'], [s2.id, 'SH-A']] as Array<[number, string]>) {
    for (let i = 1; i <= 8; i++) {
      cab.push({ storeId: sid, code: `${prefix}-${100 + i}`, level: Math.ceil(i / 4), annualFee: 365, status: CabinetStatus.FREE });
    }
  }
  await cabinets.save(cab.map(c => cabinets.create(c)));

  // 示例: 一个待确认订单(主人已提交,等待客服确认方案)
  const owner1 = await users.findOne({ where: { username: 'owner1' } });
  const pet1 = await pets.save(pets.create({
    ownerId: owner1.id, name: '咪咪', species: Species.CAT, breed: '英国短毛猫',
    weightKg: 4.2, deathTime: new Date(Date.now() - 6 * 3600000),
    photoUrl: 'https://placehold.co/300x200?text=咪咪', notes: '陪伴了 12 年,走得很安详',
  }));
  await orders.save(orders.create({
    code: `PM${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-0001`,
    petId: pet1.id, ownerId: owner1.id, storeId: s1.id,
    needPickup: true, pickupAddress: '北京市朝阳区望京西园四区 410 楼 2 单元',
    needCeremony: true, individualCremation: true, urnType: UrnType.STANDARD,
    needPawPrint: true, needPhotoVideo: true, storageMonths: 12,
    handoverMethod: HandoverMethod.STORAGE,
    ceremonyTime: new Date(Date.now() + 2 * 86400000),
    remark: '希望仪式简单温馨,家人会到场',
  }));

  console.log('seed done.');
  console.log('测试账号(密码均为 123456): owner1 owner2 / cs1 cs2 / pickup1 / ceremony1 / cremator1 / keepsake1 / finance1 / manager1');
  await ds.destroy();
}

seed().catch(e => { console.error(e); process.exit(1); });
