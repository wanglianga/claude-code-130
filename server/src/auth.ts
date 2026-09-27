import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException,
  SetMetadata, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { config } from './config';
import { Role } from './entities';

export interface AuthUser { id: number; username: string; name: string; role: Role; storeId: number | null; }

export function signToken(u: AuthUser): string {
  return jwt.sign({ sub: u.id, username: u.username, name: u.name, role: u.role, storeId: u.storeId ?? null }, config.jwtSecret, { expiresIn: '7d' });
}

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('未登录');
    try {
      const p: any = jwt.verify(token, config.jwtSecret);
      req.user = { id: p.sub, username: p.username, name: p.name, role: p.role, storeId: p.storeId } as AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('登录已过期');
    }
  }
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser = req.user;
    if (!user) throw new UnauthorizedException('未登录');
    if (!roles.includes(user.role)) throw new ForbiddenException('无权访问该资源');
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
