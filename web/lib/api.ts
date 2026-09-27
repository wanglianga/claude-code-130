const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}
export function getUser(): any {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}
export function setAuth(token: string, user: any) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export async function api(path: string, opts: { method?: string; body?: any } = {}) {
  const headers: any = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.includes('/auth/login')) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('未登录');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `请求失败(${res.status})`);
  return data;
}

export const ROLE_NAMES: Record<string, string> = {
  OWNER: '宠物主人', CS: '客服', PICKUP: '接送员', CEREMONY: '礼仪师',
  CREMATOR: '火化师', KEEPSAKE: '纪念品制作', FINANCE: '财务', MANAGER: '管理者',
};

export const ORDER_STATUS: Record<string, string> = {
  PENDING: '待确认方案', CONFIRMED: '已确认待调度', SCHEDULED: '已调度',
  IN_PROGRESS: '服务进行中', COMPLETED: '已完成', CANCELLED: '已取消',
};

export const NODE_STATUS: Record<string, string> = {
  PENDING: '待调度', ASSIGNED: '已安排', IN_PROGRESS: '进行中',
  DONE: '已完成', SKIPPED: '已跳过', BLOCKED: '受阻',
};

export const NODE_TYPE_NAMES: Record<string, string> = {
  CONFIRM: '方案确认', PICKUP: '上门接送', COLD_STORAGE: '冷藏暂存', CEREMONY: '告别仪式',
  CREMATION: '火化', KEEPSAKE: '纪念品制作', URN_HANDOVER: '骨灰交付', STORAGE: '骨灰寄存',
};

export const INCIDENT_TYPE_NAMES: Record<string, string> = {
  CEREMONY_RESCHEDULE: '仪式改期', WEIGHT_MISMATCH: '体重与报价不符', TRAFFIC_DELAY: '接送交通延误',
  VIDEO_WITNESS: '家属视频见证', KEEPSAKE_FAILURE: '纪念品制作失败', SHIPPING_DAMAGE: '骨灰盒寄送破损',
  STORAGE_EXPIRED: '寄存到期未续费', OTHER: '其他异常',
};

export const INCIDENT_STATUS: Record<string, string> = {
  OPEN: '待处理', PROCESSING: '处理中', RESOLVED: '已解决', CLOSED: '已关闭',
};

export const FEE_STATUS: Record<string, string> = {
  PENDING: '待财务确认', CONFIRMED: '待支付', PAID: '已支付', SETTLED: '已结算',
};

export const FEE_CATEGORY: Record<string, string> = {
  BASE: '基础服务费', ADDON: '增值服务', ADJUSTMENT: '费用调整',
  COMPENSATION: '赔付', REFUND: '退款', STORAGE_FEE: '寄存年费',
};

export const KEEPSAKE_STATUS: Record<string, string> = {
  QUEUED: '排队中', MAKING: '制作中', FAILED: '制作失败',
  REMAKING: '重新制作中', DONE: '已完成', CANCELLED: '已取消(退款)',
};

export const KEEPSAKE_TYPES: Record<string, string> = {
  PAW_PRINT: '爪印毛发纪念', PHOTO_VIDEO: '照片视频纪念', URN: '骨灰盒定制',
};

export const FOLLOWUP_TYPES: Record<string, string> = {
  COMFORT: '情绪安抚回访', STORAGE_EXPIRY: '寄存到期跟进', KEEPSAKE_STATUS: '纪念品进度沟通',
  ANNUAL_FEE: '寄存年费提醒', SERVICE_REVIEW: '服务回访',
};

export const MOODS: Record<string, string> = {
  STABLE: '情绪平稳', SAD: '仍较悲伤', DISTRESSED: '情绪低落需关注', GRATEFUL: '心怀感激',
};

export const SPECIES: Record<string, string> = { CAT: '猫', DOG: '犬', RABBIT: '兔', EXOTIC: '异宠' };
export const URN_TYPES: Record<string, string> = { NONE: '不需要', STANDARD: '标准骨灰盒', PREMIUM: '精品骨灰盒', CUSTOM: '定制骨灰盒' };
export const HANDOVER: Record<string, string> = { STORAGE: '骨灰寄存', SHIPMENT: '快递寄送', SELF: '自行领取' };
export const EVIDENCE_KINDS: Record<string, string> = {
  PHOTO: '交接照片', CERT: '火化证明', VIDEO: '视频见证', LOCATION: '寄存位置', TRACKING: '寄送单号', NOTE: '文字记录',
};

export function fmtDT(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtD(s?: string | null): string {
  if (!s) return '—';
  return String(s).slice(0, 10);
}
export function money(n: any): string {
  const v = Number(n || 0);
  return `¥${v.toFixed(2)}`;
}
