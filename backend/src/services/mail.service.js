const logger = require('../utils/logger');
const { enqueue } = require('../queues');

const fromAddress = process.env.MAIL_FROM || 'Zwiteer <onboarding@resend.dev>';

const sendMail = async ({ to, subject, html, text }) => {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY is not configured, email was not sent');
    return { sent: false, reason: 'missing_api_key' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to,
      subject,
      html,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.error('Resend email error:', data);
    throw new Error(data.message || 'Не удалось отправить письмо');
  }

  return { sent: true, id: data.id };
};

const emailShell = ({ title, lead, actionText, actionUrl }) => `
  <div style="margin:0;padding:32px;background:#020617;color:#e2e8f0;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;border:1px solid #164e63;border-radius:24px;padding:28px;background:#07111f">
      <p style="margin:0 0 10px;color:#22d3ee;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Zwiteer</p>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#f8fafc">${title}</h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#b6c7dc">${lead}</p>
      <a href="${actionUrl}" style="display:inline-block;border-radius:999px;background:#22d3ee;color:#03101a;padding:12px 20px;font-weight:800;text-decoration:none">${actionText}</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#8aa3bd">Если кнопка не работает, открой ссылку вручную:<br>${actionUrl}</p>
    </div>
  </div>
`;

const codeEmailShell = ({ title, lead, code }) => `
  <div style="margin:0;padding:32px;background:#020617;color:#e2e8f0;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;border:1px solid #164e63;border-radius:24px;padding:28px;background:#07111f">
      <p style="margin:0 0 10px;color:#22d3ee;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Zwiteer</p>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#f8fafc">${title}</h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#b6c7dc">${lead}</p>
      <div style="display:inline-block;border:1px solid #22d3ee;border-radius:18px;background:#020617;padding:14px 20px;font-size:32px;font-weight:900;letter-spacing:.24em;color:#f8fafc">${code}</div>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#8aa3bd">Код одноразовый. Если ты не создавал аккаунт, просто проигнорируй письмо.</p>
    </div>
  </div>
`;

const sendVerificationEmailNow = ({ to, displayName, code }) => sendMail({
  to,
  subject: 'Код подтверждения Zwiteer',
  html: codeEmailShell({
    title: 'Код подтверждения email',
    lead: `Привет, ${displayName}. Введи этот код в Zwiteer, чтобы активировать аккаунт.`,
    code,
  }),
  text: `Привет, ${displayName}. Код подтверждения Zwiteer: ${code}`,
});

const sendEmailChangeVerificationNow = ({ to, displayName, code }) => sendMail({
  to,
  subject: 'Подтверждение нового email Zwiteer',
  html: codeEmailShell({
    title: 'Подтверди новый email',
    lead: `Привет, ${displayName}. Введи этот код в настройках Zwiteer, чтобы завершить смену email.`,
    code,
  }),
  text: `Привет, ${displayName}. Код подтверждения нового email Zwiteer: ${code}`,
});

const sendPasswordResetEmailNow = ({ to, displayName, url }) => sendMail({
  to,
  subject: 'Восстановление пароля Zwiteer',
  html: emailShell({
    title: 'Сброс пароля',
    lead: `Привет, ${displayName}. Нажми кнопку ниже, чтобы задать новый пароль. Ссылка одноразовая и скоро истечёт.`,
    actionText: 'Сбросить пароль',
    actionUrl: url,
  }),
  text: `Привет, ${displayName}. Сбросить пароль Zwiteer: ${url}`,
});

const queueEmail = async (jobName, payload, fallback) => {
  if (process.env.JOB_QUEUE_ENABLED === 'false') return fallback(payload);
  try {
    await enqueue('email', jobName, payload);
    return { sent: true, queued: true };
  } catch (error) {
    logger.warn(`Email queue unavailable, sending synchronously: ${error.message}`);
    return fallback(payload);
  }
};

const sendVerificationEmail = (payload) => queueEmail('verifyEmail', payload, sendVerificationEmailNow);
const sendEmailChangeVerification = (payload) => queueEmail('emailChange', payload, sendEmailChangeVerificationNow);
const sendPasswordResetEmail = (payload) => queueEmail('passwordReset', payload, sendPasswordResetEmailNow);

module.exports = {
  sendVerificationEmail,
  sendEmailChangeVerification,
  sendPasswordResetEmail,
  sendVerificationEmailNow,
  sendEmailChangeVerificationNow,
  sendPasswordResetEmailNow,
};
