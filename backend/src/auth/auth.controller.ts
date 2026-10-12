import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiExcludeEndpoint,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';
import { ApproveRegistrationDto } from './dto/approve-registration.dto';
import { RejectRegistrationDto } from './dto/reject-registration.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '내 정보 조회', description: '현재 로그인된 사용자 정보 반환.' })
  me(@CurrentUser() user: Employee) {
    const { password: _, ...result } = user;
    return result;
  }

  @Get('oidc')
  @ApiOperation({ summary: 'Azure AD OIDC 로그인 시작' })
  oidcLogin(@Res() res: Response) {
    const url = this.authService.getOidcAuthUrl();
    res.redirect(url);
  }

  @Get('oidc/callback')
  @ApiExcludeEndpoint()
  async oidcCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://ims.example.com';

    if (error || !code) {
      return res.redirect(`${frontendUrl}/login?error=oidc_failed`);
    }

    try {
      const { access_token } = await this.authService.handleOidcCallback(code);
      return res.redirect(`${frontendUrl}/auth/callback?token=${access_token}`);
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        const msg = (e.message as string);
        if (msg === 'ERR_AUTH_OIDC_PENDING')  return res.redirect(`${frontendUrl}/login?error=pending`);
        if (msg === 'ERR_AUTH_OIDC_REJECTED') return res.redirect(`${frontendUrl}/login?error=rejected`);
        if (msg === 'ERR_AUTH_OIDC_004')      return res.redirect(`${frontendUrl}/login?error=deactivated`);
      }
      return res.redirect(`${frontendUrl}/login?error=oidc_failed`);
    }
  }

  @Get('registration-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'PENDING 가입 신청 목록 조회 (MASTER only)' })
  getRegistrationRequests(@CurrentUser() actor: Employee) {
    return this.authService.getRegistrationRequests(actor);
  }

  @Post('registration-requests/:id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '가입 신청 승인 (MASTER only)' })
  @ApiParam({ name: 'id', description: 'registration_requests UUID' })
  @ApiBody({ type: ApproveRegistrationDto })
  approveRegistration(
    @Param('id') id: string,
    @Body() dto: ApproveRegistrationDto,
    @CurrentUser() actor: Employee,
  ) {
    return this.authService.approveRegistration(id, dto, actor);
  }

  @Post('registration-requests/:id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '가입 신청 반려 (MASTER only)' })
  @ApiParam({ name: 'id', description: 'registration_requests UUID' })
  @ApiBody({ type: RejectRegistrationDto })
  rejectRegistration(
    @Param('id') id: string,
    @Body() dto: RejectRegistrationDto,
    @CurrentUser() actor: Employee,
  ) {
    return this.authService.rejectRegistration(id, dto, actor);
  }
}

// Global prefix 'api'에서 제외된 OIDC callback 전용 컨트롤러
// Azure AD redirect_uri: https://ims.example.com/oidc/callback
@Controller('oidc')
export class OidcCallbackController {
  constructor(private readonly authService: AuthService) {}

  @Get('callback')
  @ApiExcludeEndpoint()
  async oidcCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://ims.example.com';

    if (error || !code) {
      return res.redirect(`${frontendUrl}/login?error=oidc_failed`);
    }

    try {
      const { access_token } = await this.authService.handleOidcCallback(code);
      return res.redirect(`${frontendUrl}/auth/callback?token=${access_token}`);
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        const msg = (e.message as string);
        if (msg === 'ERR_AUTH_OIDC_PENDING')  return res.redirect(`${frontendUrl}/login?error=pending`);
        if (msg === 'ERR_AUTH_OIDC_REJECTED') return res.redirect(`${frontendUrl}/login?error=rejected`);
        if (msg === 'ERR_AUTH_OIDC_004')      return res.redirect(`${frontendUrl}/login?error=deactivated`);
      }
      return res.redirect(`${frontendUrl}/login?error=oidc_failed`);
    }
  }
}
