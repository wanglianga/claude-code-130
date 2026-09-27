import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

// ---------- 枚举 ----------
export enum Role {
  OWNER = 'OWNER',         // 宠物主人
  CS = 'CS',               // 客服
  PICKUP = 'PICKUP',       // 接送员
  CEREMONY = 'CEREMONY',   // 礼仪师
  CREMATOR = 'CREMATOR',   // 火化师
  KEEPSAKE = 'KEEPSAKE',   // 纪念品制作
  FINANCE = 'FINANCE',     // 财务
  MANAGER = 'MANAGER',     // 管理者
}

export enum Species { CAT = 'CAT', DOG = 'DOG', RABBIT = 'RABBIT', EXOTIC = 'EXOTIC' }

export enum OrderStatus {
  PENDING = 'PENDING',         // 待客服确认
  CONFIRMED = 'CONFIRMED',     // 方案已确认(待调度)
  SCHEDULED = 'SCHEDULED',     // 已调度
  IN_PROGRESS = 'IN_PROGRESS', // 服务进行中
  COMPLETED = 'COMPLETED',     // 已完成
  CANCELLED = 'CANCELLED',
}

export enum UrnType { NONE = 'NONE', STANDARD = 'STANDARD', PREMIUM = 'PREMIUM', CUSTOM = 'CUSTOM' }

export enum HandoverMethod { STORAGE = 'STORAGE', SHIPMENT = 'SHIPMENT', SELF = 'SELF' }

export enum NodeType {
  CONFIRM = 'CONFIRM',             // 方案确认
  PICKUP = 'PICKUP',               // 上门接送
  COLD_STORAGE = 'COLD_STORAGE',   // 冷藏暂存
  CEREMONY = 'CEREMONY',           // 告别仪式
  CREMATION = 'CREMATION',         // 火化
  KEEPSAKE = 'KEEPSAKE',           // 纪念品制作
  URN_HANDOVER = 'URN_HANDOVER',   // 骨灰交付
  STORAGE = 'STORAGE',             // 骨灰寄存
}

export enum NodeStatus {
  PENDING = 'PENDING', ASSIGNED = 'ASSIGNED', IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE', SKIPPED = 'SKIPPED', BLOCKED = 'BLOCKED',
}

export enum IncidentType {
  CEREMONY_RESCHEDULE = 'CEREMONY_RESCHEDULE', // 仪式改期
  WEIGHT_MISMATCH = 'WEIGHT_MISMATCH',         // 体重与报价不符
  TRAFFIC_DELAY = 'TRAFFIC_DELAY',             // 接送交通延误
  VIDEO_WITNESS = 'VIDEO_WITNESS',             // 家属视频见证
  KEEPSAKE_FAILURE = 'KEEPSAKE_FAILURE',       // 纪念品制作失败
  SHIPPING_DAMAGE = 'SHIPPING_DAMAGE',         // 骨灰盒寄送破损
  STORAGE_EXPIRED = 'STORAGE_EXPIRED',         // 寄存到期未续费
  OTHER = 'OTHER',
}

export enum IncidentStatus { OPEN = 'OPEN', PROCESSING = 'PROCESSING', RESOLVED = 'RESOLVED', CLOSED = 'CLOSED' }

export enum FeeCategory {
  BASE = 'BASE', ADDON = 'ADDON', ADJUSTMENT = 'ADJUSTMENT',
  COMPENSATION = 'COMPENSATION', REFUND = 'REFUND', STORAGE_FEE = 'STORAGE_FEE',
}

export enum FeeStatus { PENDING = 'PENDING', CONFIRMED = 'CONFIRMED', PAID = 'PAID', SETTLED = 'SETTLED' }

export enum CabinetStatus { FREE = 'FREE', OCCUPIED = 'OCCUPIED', MAINTENANCE = 'MAINTENANCE' }

export enum StorageStatus { ACTIVE = 'ACTIVE', EXPIRED = 'EXPIRED', WITHDRAWN = 'WITHDRAWN' }

export enum ShipmentStatus { PREPARING = 'PREPARING', SHIPPED = 'SHIPPED', DELIVERED = 'DELIVERED', DAMAGED = 'DAMAGED' }

export enum KeepsakeStatus { QUEUED = 'QUEUED', MAKING = 'MAKING', FAILED = 'FAILED', REMAKING = 'REMAKING', DONE = 'DONE', CANCELLED = 'CANCELLED' }

export enum FollowUpType {
  COMFORT = 'COMFORT',                   // 情绪安抚回访
  STORAGE_EXPIRY = 'STORAGE_EXPIRY',     // 寄存到期
  KEEPSAKE_STATUS = 'KEEPSAKE_STATUS',   // 纪念品进度
  ANNUAL_FEE = 'ANNUAL_FEE',             // 寄存年费
  SERVICE_REVIEW = 'SERVICE_REVIEW',     // 服务回访
}

export enum FollowUpStatus { PENDING = 'PENDING', DONE = 'DONE', CANCELLED = 'CANCELLED' }

// ---------- 实体 ----------
@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ default: '' }) city: string;
  @Column({ default: '' }) address: string;
  @Column({ default: '' }) phone: string;
}

@Entity('hospitals')
export class Hospital {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ default: '' }) contactName: string;
  @Column({ default: '' }) phone: string;
  @Column({ nullable: true }) storeId: number; // 合作门店
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) username: string;
  @Column() passwordHash: string;
  @Column() name: string;
  @Column({ default: '' }) phone: string;
  @Column({ type: 'varchar', length: 20 }) role: Role;
  @Column({ nullable: true }) storeId: number;
  @CreateDateColumn() createdAt: Date;
}

@Entity('pets')
export class Pet {
  @PrimaryGeneratedColumn() id: number;
  @Column() ownerId: number;
  @Column() name: string;
  @Column({ type: 'varchar', length: 10 }) species: Species;
  @Column({ default: '' }) breed: string;
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 }) weightKg: number;
  @Column({ type: 'datetime', nullable: true }) deathTime: Date;
  @Column({ default: '' }) photoUrl: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity('orders')
export class ServiceOrder {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) code: string;
  @Column() petId: number;
  @Column() @Index() ownerId: number;
  @Column() @Index() storeId: number;
  @Column({ nullable: true }) hospitalId: number; // 宠物医院转介来源
  @Column({ type: 'varchar', length: 20, default: OrderStatus.PENDING }) status: OrderStatus;
  // 服务选项
  @Column({ default: false }) needPickup: boolean;
  @Column({ default: '' }) pickupAddress: string;
  @Column({ default: false }) needCeremony: boolean;
  @Column({ default: true }) individualCremation: boolean; // 单独火化
  @Column({ type: 'varchar', length: 20, default: UrnType.NONE }) urnType: UrnType;
  @Column({ default: false }) needPawPrint: boolean;   // 爪印毛发纪念
  @Column({ default: false }) needPhotoVideo: boolean; // 照片视频
  @Column({ default: 0 }) storageMonths: number;       // 寄存期限(月), 0=不寄存
  @Column({ type: 'varchar', length: 20, default: HandoverMethod.SELF }) handoverMethod: HandoverMethod;
  // 报价与费用
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) quotedAmount: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) quotedWeightKg: number;
  @Column({ type: 'datetime', nullable: true }) ceremonyTime: Date;
  @Column({ type: 'text', nullable: true }) remark: string;
  @CreateDateColumn() createdAt: Date;
  @Column({ type: 'datetime', nullable: true }) confirmedAt: Date;
  @Column({ type: 'datetime', nullable: true }) completedAt: Date;
}

@Entity('order_nodes')
export class OrderNode {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() orderId: number;
  @Column({ type: 'varchar', length: 20 }) type: NodeType;
  @Column() seq: number;
  @Column({ type: 'varchar', length: 20, default: NodeStatus.PENDING }) status: NodeStatus;
  @Column({ nullable: true }) assigneeId: number;
  @Column({ nullable: true }) storeId: number;
  @Column({ type: 'datetime', nullable: true }) promisedAt: Date; // 承诺完成时间
  @Column({ type: 'datetime', nullable: true }) startedAt: Date;
  @Column({ type: 'datetime', nullable: true }) completedAt: Date;
  @Column({ type: 'json', nullable: true }) evidence: any[]; // [{kind,url,note,uploadedBy,uploadedAt}]
  @Column({ default: false }) ownerConfirmed: boolean; // 家属确认
  @Column({ type: 'datetime', nullable: true }) ownerConfirmedAt: Date;
  @Column({ type: 'text', nullable: true }) note: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() orderId: number;
  @Column({ type: 'varchar', length: 30 }) type: IncidentType;
  @Column({ type: 'varchar', length: 20, default: IncidentStatus.OPEN }) status: IncidentStatus;
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ nullable: true }) relatedNodeId: number;
  @Column() createdById: number;
  @Column({ nullable: true }) handledById: number;
  @Column({ type: 'text', nullable: true }) resolution: string;
  @Column({ type: 'json', nullable: true }) meta: any;
  @CreateDateColumn() createdAt: Date;
  @Column({ type: 'datetime', nullable: true }) resolvedAt: Date;
}

@Entity('fee_items')
export class FeeItem {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() orderId: number;
  @Column() name: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: number; // 正=应收, 负=退/赔
  @Column({ type: 'varchar', length: 20 }) category: FeeCategory;
  @Column({ type: 'varchar', length: 20, default: FeeStatus.PENDING }) status: FeeStatus;
  @Column({ nullable: true }) incidentId: number;
  @Column() createdById: number;
  @Column({ nullable: true }) confirmedById: number; // 财务确认人
  @CreateDateColumn() createdAt: Date;
  @Column({ type: 'datetime', nullable: true }) confirmedAt: Date;
  @Column({ type: 'datetime', nullable: true }) paidAt: Date;
}

@Entity('storage_cabinets')
export class StorageCabinet {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() storeId: number;
  @Column() code: string; // 柜位编号 如 A-101
  @Column({ default: 1 }) level: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 365 }) annualFee: number; // 年费
  @Column({ type: 'varchar', length: 20, default: CabinetStatus.FREE }) status: CabinetStatus;
}

@Entity('storage_records')
export class StorageRecord {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) orderId: number;
  @Column() cabinetId: number;
  @Column() storeId: number;
  @Column({ default: '' }) positionDesc: string; // 寄存位置描述
  @Column({ type: 'date' }) startDate: string;
  @Column({ type: 'date' }) endDate: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) yearlyFee: number;
  @Column({ default: 0 }) renewCount: number;
  @Column({ type: 'varchar', length: 20, default: StorageStatus.ACTIVE }) status: StorageStatus;
  @CreateDateColumn() createdAt: Date;
}

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) orderId: number;
  @Column({ default: '' }) carrier: string;
  @Column({ default: '' }) trackingNo: string; // 寄送单号
  @Column({ type: 'varchar', length: 20, default: ShipmentStatus.PREPARING }) status: ShipmentStatus;
  @Column({ default: '' }) receiverAddress: string;
  @Column({ type: 'datetime', nullable: true }) shippedAt: Date;
  @Column({ type: 'datetime', nullable: true }) deliveredAt: Date;
}

@Entity('keepsake_jobs')
export class KeepsakeJob {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() orderId: number;
  @Column({ type: 'varchar', length: 20 }) type: string; // PAW_PRINT 爪印 / PHOTO_VIDEO 影像 / URN 骨灰盒
  @Column({ type: 'varchar', length: 20, default: KeepsakeStatus.QUEUED }) status: KeepsakeStatus;
  @Column({ nullable: true }) assigneeId: number;
  @Column({ default: 0 }) attemptCount: number;
  @Column({ type: 'text', nullable: true }) failReason: string;
  @Column({ type: 'datetime', nullable: true }) completedAt: Date;
}

@Entity('follow_ups')
export class FollowUp {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() orderId: number;
  @Column({ type: 'varchar', length: 20 }) type: FollowUpType;
  @Column({ type: 'varchar', length: 20, default: FollowUpStatus.PENDING }) status: FollowUpStatus;
  @Column({ type: 'datetime' }) scheduledAt: Date;
  @Column({ nullable: true }) assigneeId: number; // 负责客服
  @Column({ type: 'datetime', nullable: true }) completedAt: Date;
  @Column({ type: 'text', nullable: true }) summary: string; // 回访记录
  @Column({ type: 'varchar', length: 20, nullable: true }) ownerMood: string; // STABLE/SAD/DISTRESSED/GRATEFUL
  @Column({ type: 'datetime', nullable: true }) nextFollowUpAt: Date;
  @CreateDateColumn() createdAt: Date;
}

@Entity('album_photos')
export class AlbumPhoto {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() petId: number;
  @Column({ nullable: true }) orderId: number;
  @Column() url: string;
  @Column({ default: '' }) caption: string;
  @Column() uploadedById: number;
  @CreateDateColumn() createdAt: Date;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn() id: number;
  @Column() @Index() userId: number;
  @Column({ nullable: true }) orderId: number;
  @Column() content: string;
  @Column({ default: false }) read: boolean;
  @CreateDateColumn() createdAt: Date;
}

export const ALL_ENTITIES = [
  Store, Hospital, User, Pet, ServiceOrder, OrderNode, Incident, FeeItem,
  StorageCabinet, StorageRecord, Shipment, KeepsakeJob, FollowUp, AlbumPhoto, Notification,
];
