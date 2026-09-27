import { Body, Controller, Get, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Module } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IsNotEmpty } from 'class-validator';
import { User, Role } from '../entities';
import { signToken, JwtGuard, CurrentUser, AuthUser } from '../auth';

class LoginDto {
  @IsNotEmpty() username: string;
  @IsNotEmpty() password: string;
}

@Controller('api/auth')
export class AuthController {
  constructor(@InjectRepository(User) private users: Repository<User>) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const u = await this.users.findOne({ where: { username: dto.username } });
    if (!u || !bcrypt.compareSync(dto.password, u.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload: AuthUser = { id: u.id, username: u.username, name: u.name, role: u.role, storeId: u.storeId ?? null };
    return { token: signToken(payload), user: payload };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
})
export class AuthModule {}
