import nodemailer from 'nodemailer';

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string
): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.warn('[email] SMTP_HOST not configured — skipping email:', subject);
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@cupa-tool';

  try {
    await transport.sendMail({ from, to, subject, html });
  } catch (err) {
    // Log but don't throw — email failures should not break the main workflow
    console.error('[email] Failed to send email:', err);
  }
}

// ── Email templates ──────────────────────────────────────────────

const baseUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

function htmlWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <div style="border-bottom:2px solid #3b82f6;padding-bottom:12px;margin-bottom:24px">
    <h2 style="margin:0;color:#1e40af">CUPA Equity Tool</h2>
  </div>
  ${body}
  <div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:16px;font-size:12px;color:#6b7280">
    This is an automated notification from the CUPA Equity Tool.
    Do not reply to this email.
  </div>
</body>
</html>`;
}

export function emailVpCycleAssignment(params: {
  to: string;
  vpName: string;
  vpTitle: string;
  cycleName: string;
  fiscalYear: string;
  deadline: string | null;
  allocatedBudget: number | null;
}) {
  const subject = `Action Required: Equity Review Cycle "${params.cycleName}" — FY${params.fiscalYear}`;
  const deadlineText = params.deadline
    ? `<p><strong>Deadline:</strong> ${new Date(params.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>`
    : '';
  const budgetText = params.allocatedBudget != null
    ? `<p><strong>Your allocated budget:</strong> ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(params.allocatedBudget)}</p>`
    : '';

  const body = `
    <p>Hello ${params.vpName},</p>
    <p>An equity review cycle has been sent to you for your division: <strong>${params.vpTitle}</strong>.</p>
    <h3 style="color:#1e40af">${params.cycleName} — FY${params.fiscalYear}</h3>
    ${budgetText}
    ${deadlineText}
    <p>Please log in to the CUPA Equity Tool to review your employees' proposed raises and submit your review.</p>
    <p style="margin-top:24px">
      <a href="${baseUrl()}/vp-review"
         style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
        Go to My Review
      </a>
    </p>`;

  return sendEmail(params.to, subject, htmlWrapper(subject, body));
}

export function emailHrPositionFlagged(params: {
  hrEmails: string[];
  positionName: string;
  positionTitle: string;
  vpName: string;
  reason: string;
  suggestedCupaCode: string | null;
  positionId: number;
}) {
  const subject = `Position Flagged for Review: ${params.positionName}`;
  const cupaText = params.suggestedCupaCode
    ? `<p><strong>Suggested CUPA Code:</strong> ${params.suggestedCupaCode}</p>`
    : '';

  const body = `
    <p>A position has been flagged for HR review.</p>
    <h3 style="color:#b45309">${params.positionName} — ${params.positionTitle}</h3>
    <p><strong>Flagged by:</strong> ${params.vpName}</p>
    <p><strong>Reason:</strong> ${params.reason}</p>
    ${cupaText}
    <p style="margin-top:24px">
      <a href="${baseUrl()}/positions/${params.positionId}"
         style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
        View Position
      </a>
    </p>`;

  return sendEmail(params.hrEmails, subject, htmlWrapper(subject, body));
}

export function emailHrVpReviewSubmitted(params: {
  hrEmails: string[];
  vpName: string;
  vpTitle: string;
  cycleName: string;
  fiscalYear: string;
  proposedTotal: number | null;
  cycleId: number;
}) {
  const subject = `VP Review Submitted: ${params.vpTitle} — ${params.cycleName}`;
  const totalText = params.proposedTotal != null
    ? `<p><strong>Total proposed raises:</strong> ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(params.proposedTotal)}</p>`
    : '';

  const body = `
    <p>${params.vpName} (${params.vpTitle}) has approved their equity review for <strong>${params.cycleName} — FY${params.fiscalYear}</strong>.</p>
    ${totalText}
    <p style="margin-top:24px">
      <a href="${baseUrl()}/review-cycles/${params.cycleId}"
         style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
        View Cycle
      </a>
    </p>`;

  return sendEmail(params.hrEmails, subject, htmlWrapper(subject, body));
}
