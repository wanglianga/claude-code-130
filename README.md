# 安宁宠物善终服务平台

宠物善终服务预约告别与骨灰寄存平台。覆盖 **预约下单 → 客服确认方案 → 调度(接送/冷藏/火化炉/告别室/纪念品) → 分角色执行留痕 → 骨灰交付(寄存/寄送/自取) → 费用结算 → 情感回访** 的完整闭环,并对敏感环节(交接照片、火化证明、视频见证、寄存位置、寄送单号)做节点级留痕,支持异常工单多角色协同处理与管理者全程追溯。

## 技术栈

- **前端**: Next.js 14 (App Router) + React 18,端口 `3000`
- **后端**: NestJS 10 + TypeORM 0.3 + JWT,端口 `4000`
- **数据库**: MySQL 兼容的 MariaDB 10.11(本地免安装绿色部署),端口 `3307`

## 目录结构

```
├── server/            # NestJS 后端
│   ├── src/entities.ts           # 15 张表:用户/门店/医院/宠物/订单/环节节点/异常工单/费用/柜位/寄存/寄送/纪念品/回访/相册/通知
│   ├── src/modules/              # auth/orders(节点流转)/incidents(异常联动)/fees/storage/ops(纪念品·寄送·回访)/base/manager
│   ├── src/seed.ts               # 建表 + 种子数据
│   └── e2e.mjs                   # 端到端验证脚本(60 项断言)
├── web/               # Next.js 前端(登录/订单/调度/任务/纪念品/异常/回访/寄存/财务/看板/相册/消息)
├── mariadb/           # 绿色版 MariaDB 运行时
├── mariadb-data/      # 数据库数据目录
├── start.sh           # 一键启动(数据库+后端+前端)
└── stop.sh            # 一键停止
```

## 本地启动

### 方式一:一键启动(推荐)

```bash
./start.sh        # 启动 MariaDB + 后端 :4000 + 前端 :3000
./stop.sh         # 全部停止
```

### 方式二:分步启动

```bash
# 1. 数据库(本仓库已含绿色版 MariaDB 与初始化好的数据目录)
mkdir -p mariadb-tmp
./mariadb/bin/mariadbd --no-defaults \
  --basedir=$PWD/mariadb --datadir=$PWD/mariadb-data \
  --socket=$PWD/mariadb-tmp/mysql.sock --port=3307 --bind-address=127.0.0.1 &

# 2. 后端(首次运行先执行种子: cd server && npm install && npm run seed)
cd server && npm install && npm run dev        # http://localhost:4000

# 3. 前端(首次: cd web && npm install && npm run build)
cd web && npm install && npm run dev           # 开发模式 http://localhost:3000
#   或生产模式: npm run build && npm run start
```

> 数据库连接默认值见 `server/src/config.ts`(可用环境变量 `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME` 覆盖)。
> 库名 `pet_memorial`,账号 `pet` / `pet123456`。首次部署全新数据库时执行 `cd server && npm run seed` 建表并写入种子数据。

## 测试账号(密码均为 `123456`)

| 账号 | 角色 | 主要功能 |
|---|---|---|
| `owner1` / `owner2` | 宠物主人 | 预约下单、改仪式时间、视频见证申请、费用支付、环节确认、纪念相册、查看回访 |
| `cs1`(北京店)/ `cs2`(上海店) | 客服 | 确认方案报价、调度人员与承诺时间、分配寄存柜位、创建寄送单、处理异常工单、回访 |
| `pickup1` | 接送员 | 接送任务执行、上传交接照片、报告交通延误 |
| `ceremony1` | 礼仪师 | 告别仪式执行留痕 |
| `cremator1` | 火化师 | 火化执行、上传火化证明、报告体重不符 |
| `keepsake1` | 纪念品制作 | 爪印/影像/骨灰盒工单、上报制作失败 |
| `finance1` | 财务 | 费用项审核、赔付/退款结算 |
| `manager1` | 管理者 | 运营看板(承诺时间达成/费用变化/异常/家属确认)、全订单追溯 |

种子数据含:2 家门店、2 家合作宠物医院(转介来源)、16 个寄存柜位、1 个待确认示例订单。

## 核心流程(建议体验路径)

1. `owner1` 登录 → 「预约新服务」提交猫/犬/兔/异宠善终申请(体重、死亡时间、上门接送、仪式、单独火化、骨灰盒、爪印毛发、照片视频、寄存期限)。
2. `cs1` 登录 → 订单详情「确认方案报价」→ 系统自动生成环节节点、费用明细、纪念品工单 → 「调度安排」为各环节指派人员与承诺时间。
3. `pickup1` / `ceremony1` / `cremator1` / `keepsake1` 在「我的任务/纪念品工单」逐环节执行并上传见证材料(接送必须交接照片、火化必须火化证明)。
4. 过程中可模拟异常:主人改仪式时间、接送交通延误、家属视频见证、火化师报告体重不符(→费用调整→财务审核→主人补付)、纪念品制作失败(→重做或退款)、寄送破损(→赔付)、寄存到期未续费(→续费或取回)。
5. `cs1` 分配寄存柜位(自动生成年费账单与到期提醒)→ 完成骨灰交付 → 订单完成,系统自动安排情绪安抚回访与服务回访。
6. `manager1` 在看板查看各环节承诺时间达成率、超时环节、费用变化、待家属确认环节与异常分布,敏感争议可追溯到具体交接节点。

## 验证方式

### 自动化端到端验证(60 项断言)

```bash
# 先启动后端(:4000),再执行:
cd server && node e2e.mjs
```

覆盖:9 角色登录、下单、方案确认、节点生成、调度、接送留痕校验、仪式改期工单、视频见证、体重不符费用调整(财务确认+主人支付)、纪念品失败重做、寄存入柜(年费账单+到期提醒)、交付完成自动回访、家属确认、纪念相册、寄存续费、快递寄送+破损赔付、寄存到期工单联动、管理者看板、权限控制(401/403)。

### 手工验证

- 前端 `http://localhost:3000/login` 用测试账号登录,按「核心流程」路径操作;
- 寄存到期场景:将 `storage_records.endDate` 改为过去日期后调用 `POST /api/storage/check-expiry`(或访问寄存管理页),系统自动标记到期、生成异常工单与回访任务,续费后工单自动关闭。

## 实际验证结论

- `cd server && node e2e.mjs`:**60 项断言全部通过**(2026-09-25 执行)。
- 寄存到期专项:改库模拟到期 → 检查接口标记 EXPIRED 并生成「寄存到期未续费」工单与回访任务 → 续费 12 个月后记录恢复 ACTIVE、工单自动 RESOLVED 并生成续费账单,已实测通过。
- 前端 13 个路由(`/login` `/` `/orders` `/orders/new` `/orders/[id]` `/manager` `/finance` `/storage` `/tasks` `/keepsakes` `/incidents` `/follow-ups` `/pets` `/notifications`)均返回 200,生产构建(`next build`)通过。
- 后端 `tsc --noEmit` 类型检查通过。
