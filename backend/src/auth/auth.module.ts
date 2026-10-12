import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController, OidcCallbackController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { Employee } from '../employees/employee.entity';
import { RegistrationRequest } from './registration-request.entity';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET!,
        signOptions: { expiresIn: '8h' },
      }),
    }),
    TypeOrmModule.forFeature([Employee, RegistrationRequest]),
  ],
  controllers: [AuthController, OidcCallbackController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
