import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      this.logger.warn('SMTP_HOST not configured — 이메일 전송 비활성화');
    }
  }

  private readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private async send(to: string, subject: string, html: string) {
    if (!this.transporter || !to) return;
    // 이메일 형식 검증 — 비유효 주소로 SMTP 인증 에러 방지
    if (!this.EMAIL_REGEX.test(to.trim())) {
      this.logger.warn(`이메일 건너뜀 (비유효 주소): ${to}`);
      return;
    }
    this.logger.log(`이메일 발송 → ${to.trim()} | ${subject}`);
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM ?? 'IMS <noreply@example.com>',
        to: to.trim(),
        subject,
        html,
      });
      this.logger.log(`이메일 발송 완료 → ${to.trim()}`);
    } catch (err) {
      // 에러 로깅만 — 호출자에게 예외 전파하지 않음
      this.logger.error(`이메일 발송 실패 (${to.trim()}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 로그인 알림 */
  async sendLoginAlert(email: string, name: string) {
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    await this.send(
      email,
      '[IMS] 로그인 알림',
      `<p>${name}님, <strong>${now}</strong>에 IMS에 로그인되었습니다.</p>
       <p>본인이 아니라면 비밀번호를 즉시 변경해주세요.</p>`,
    );
  }

  /** 구매요청 제출 알림 — 요청자 본인 / 팀원 / 경영지원팀 / 승인권자에게 발송 */
  async sendPurchaseRequestApprovalNeeded(
    approverEmail: string,
    approverName: string,
    requesterName: string,
    requestTitle: string,
    requestId: string,
    link?: string,
  ) {
    const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
    const href = link ?? `${appUrl}/purchase-requests?search=${requestId}`;
    await this.send(
      approverEmail,
      `[IMS] 구매요청 제출 — ${requestTitle}`,
      `<p>${approverName}님,</p>
       <p><strong>${requesterName}</strong>님이 구매요청(<strong>${requestTitle}</strong>)을 제출했습니다.</p>
       <p>요청 번호: <code>${requestId}</code></p>
       <p><a href="${href}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 구매 승인 결과 알림 — 요청자에게 발송 */
  async sendPurchaseRequestResult(
    requesterEmail: string,
    requesterName: string,
    requestTitle: string,
    status: 'APPROVED' | 'REJECTED',
    note?: string,
  ) {
    const label = status === 'APPROVED' ? '승인' : '반려';
    await this.send(
      requesterEmail,
      `[IMS] 구매요청 ${label} — ${requestTitle}`,
      `<p>${requesterName}님,</p>
       <p>구매요청(<strong>${requestTitle}</strong>)이 <strong>${label}</strong>되었습니다.</p>
       ${note ? `<p>사유: ${note}</p>` : ''}`,
    );
  }

  /** 발주 생성 알림 — 요청자에게 발송 */
  async sendPurchaseOrderCreated(
    requesterEmail: string,
    requesterName: string,
    requestTitle: string,
    orderId: string,
    supplier: string,
  ) {
    await this.send(
      requesterEmail,
      `[IMS] 발주 생성 — ${requestTitle}`,
      `<p>${requesterName}님,</p>
       <p>구매요청(<strong>${requestTitle}</strong>)에 대한 발주가 생성되었습니다.</p>
       <p>발주 번호: <code>${orderId}</code> / 공급업체: ${supplier}</p>`,
    );
  }

  /** 가입 승인 요청 알림 — MASTER에게 발송 */
  async sendRegistrationRequest(
    masterEmail: string,
    masterName: string,
    applicantName: string,
    applicantEmail: string,
  ) {
    const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
    const href = `${appUrl}/registration-requests`;
    await this.send(
      masterEmail,
      '[IMS] 신규 가입 승인 요청',
      `<p>${masterName}님,</p>
       <p><strong>${applicantName}</strong> (${applicantEmail})님이 IMS 가입을 신청했습니다.</p>
       <p>아래 버튼을 눌러 가입 신청을 검토·승인해주세요.</p>
       <p><a href="${href}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">가입 승인 바로가기</a></p>`,
    );
  }

  /** 가입 승인 완료 알림 — 신청자에게 발송 */
  async sendRegistrationApproved(email: string, name: string) {
    await this.send(
      email,
      '[IMS] 가입이 승인되었습니다',
      `<p>${name}님,</p>
       <p>IMS 가입 신청이 <strong>승인</strong>되었습니다.</p>
       <p>이제 Azure AD 계정으로 로그인하실 수 있습니다.</p>`,
    );
  }

  /** 가입 반려 알림 — 신청자에게 발송 */
  async sendRegistrationRejected(email: string, name: string, reason?: string) {
    await this.send(
      email,
      '[IMS] 가입 신청이 반려되었습니다',
      `<p>${name}님,</p>
       <p>IMS 가입 신청이 <strong>반려</strong>되었습니다.</p>
       ${reason ? `<p>반려 사유: ${reason}</p>` : ''}
       <p>문의사항이 있으시면 관리자에게 연락해주세요.</p>`,
    );
  }

  /** 입고 완료 알림 */
  async sendStoreReceived(
    email: string,
    name: string,
    prTitle: string,
    storeId: string,
    appUrl: string,
  ) {
    const link = `${appUrl}/store?search=${storeId}`;
    await this.send(
      email,
      `[IMS] 입고 완료 — ${prTitle}`,
      `<p>${name}님,</p>
       <p>구매요청(<strong>${prTitle}</strong>)에 대한 입고가 완료되었습니다.</p>
       <p>입고 번호: <code>${storeId}</code></p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 납품 상태 변경 알림 */
  async sendShipmentStatusChanged(
    email: string,
    name: string,
    shipmentId: string,
    status: string,
    appUrl: string,
  ) {
    const statusLabel: Record<string, string> = {
      SHIPPED: '납품 출고',   // 발송 단계 폐지 전 문서
      CONFIRMED: '납품 완료',
      CANCELLED: '납품 취소',
      RETRIEVED: '납품 회수',
    };
    const label = statusLabel[status] ?? status;
    const link = `${appUrl}/shipment-status?search=${shipmentId}`;
    await this.send(
      email,
      `[IMS] 납품 상태 변경 — ${label}`,
      `<p>${name}님,</p>
       <p>납품(<code>${shipmentId}</code>) 상태가 <strong>${label}</strong>으로 변경되었습니다.</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 직원 권한/설정 변경 알림 — 해당 직원 본인에게 발송 */
  async sendEmployeeSettingsChanged(
    email: string,
    name: string,
    changeType: string,
    appUrl: string,
  ) {
    const link = `${appUrl}/dashboard`;
    await this.send(
      email,
      `[IMS] 계정 설정 변경 알림`,
      `<p>${name}님,</p>
       <p>귀하의 계정 설정이 변경되었습니다: <strong>${changeType}</strong></p>
       <p>본인이 요청하지 않은 변경이라면 관리자에게 문의해주세요.</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 품목관리 변경 알림 — 경영지원팀에게 발송 */
  async sendItemChanged(
    email: string,
    name: string,
    itemName: string,
    changeType: string,
    appUrl: string,
    itemCode?: string,
  ) {
    const link = itemCode ? `${appUrl}/items?search=${itemCode}` : `${appUrl}/items`;
    await this.send(
      email,
      `[IMS] 품목 ${changeType} — ${itemName}`,
      `<p>${name}님,</p>
       <p>품목 <strong>${itemName}</strong>이(가) <strong>${changeType}</strong>되었습니다.</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 창고관리 변경 알림 — 경영지원팀에게 발송 */
  async sendStorageChanged(
    email: string,
    name: string,
    storageName: string,
    changeType: string,
    appUrl: string,
  ) {
    const link = `${appUrl}/storage`;
    await this.send(
      email,
      `[IMS] 창고 ${changeType} — ${storageName}`,
      `<p>${name}님,</p>
       <p>창고 <strong>${storageName}</strong>이(가) <strong>${changeType}</strong>되었습니다.</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 팀관리 변경 알림 — 경영지원팀에게 발송 */
  async sendTeamChanged(
    email: string,
    name: string,
    teamName: string,
    changeType: string,
    appUrl: string,
  ) {
    const link = `${appUrl}/teams`;
    await this.send(
      email,
      `[IMS] 팀 ${changeType} — ${teamName}`,
      `<p>${name}님,</p>
       <p>팀 <strong>${teamName}</strong>이(가) <strong>${changeType}</strong>되었습니다.</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 재고사용 상태 변경 알림 */
  async sendStockUsageStatusChanged(
    email: string,
    name: string,
    itemName: string,
    qty: number,
    usageNo: string,
    status: string,
    appUrl: string,
  ) {
    const statusLabel: Record<string, string> = {
      PENDING: '등록',
      COMPLETED: '사용완료',
      RETURNED: '반납',
      CANCELLED: '취소',
    };
    const label = statusLabel[status] ?? status;
    const link = `${appUrl}/stock-usages?search=${usageNo}`;
    await this.send(
      email,
      `[IMS] 재고사용 ${label} — ${itemName}`,
      `<p>${name}님,</p>
       <p>재고사용(<code>${usageNo}</code>) 상태가 <strong>${label}</strong>으로 변경되었습니다.</p>
       <p>품목: <strong>${itemName}</strong> / 수량: ${qty}</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 바로가기</a></p>`,
    );
  }

  /** 재고이동 요청 알림 — 인수자에게 발송 */
  async sendStockMovementRequest(
    receiverEmail: string, receiverName: string,
    moverName: string, itemName: string, qty: number, movementNo: string,
  ) {
    const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
    const link = `${appUrl}/stock-movements?search=${movementNo}`;
    await this.send(
      receiverEmail,
      `[IMS] 재고이동 인수 요청 — ${itemName}`,
      `<p>${receiverName}님,</p>
       <p><strong>${moverName}</strong>님이 재고이동을 등록하고 귀하를 인수자로 지정했습니다.</p>
       <p>품목: <strong>${itemName}</strong> / 수량: ${qty}</p>
       <p>이동번호: <code>${movementNo}</code></p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 재고이동 바로가기</a></p>`,
    );
  }

  /** 재고이동 승인 알림 — 인계자에게 발송 */
  async sendStockMovementApproved(
    moverEmail: string, moverName: string,
    approverName: string, itemName: string, qty: number, movementNo: string,
  ) {
    const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
    const link = `${appUrl}/stock-movements?search=${movementNo}`;
    await this.send(
      moverEmail,
      `[IMS] 재고이동 승인 완료 — ${itemName}`,
      `<p>${moverName}님,</p>
       <p>재고이동 요청(<code>${movementNo}</code>)이 <strong>${approverName}</strong>님에 의해 승인되었습니다.</p>
       <p>품목: <strong>${itemName}</strong> / 수량: ${qty}</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">IMS 재고이동 바로가기</a></p>`,
    );
  }
}
