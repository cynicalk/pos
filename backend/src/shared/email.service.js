const nodemailer = require('nodemailer');

const APP_URL   = process.env.APP_URL   || 'http://localhost:5173';
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5174';
const FROM    = process.env.SMTP_FROM || `CookLyt <${process.env.SMTP_USER}>`;

// Logo served from the frontend's public directory.
// Gmail and Outlook block data URIs in <img>, so a proper URL is the only reliable option.
// dashboard/public/logo-email.svg is the source of truth for this image.
const LOGO_URL = `${APP_URL}/logo-email.png?v=2`;  // ?v= busts Gmail's image proxy cache

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function baseTemplate({ heading, body, ctaText, ctaUrl, expiry, footerNote }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:52px 20px 48px">

        <!-- Logo lockup -->
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px">
          <tr>
            <td align="center">

              <!-- Arc mark PNG (no font dependency) -->
              <img src="${LOGO_URL}" width="44" height="44" alt=""
                   style="display:block;margin:0 auto" />

              <!-- Wordmark: COOKLY + brown dot + T, matching og-image.svg -->
              <div style="margin-top:10px;font-family:Georgia,'Times New Roman',serif;
                          font-size:18px;letter-spacing:8px;color:#0d0c0b;font-weight:400;
                          line-height:1">
                COOKLY<span style="display:inline-block;width:5px;height:5px;
                                   border-radius:50%;background:#B06A3B;
                                   vertical-align:middle;margin:0 5px 2px 7px;
                                   letter-spacing:0"></span>T
              </div>

            </td>
          </tr>
        </table>

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:480px;background:#fafaf8;border:1px solid #e8e4de;border-radius:10px">
          <tr>
            <td style="padding:40px 40px 36px">

              <h1 style="margin:0 0 14px;font-size:22px;font-weight:600;color:#0d0c0b;
                         line-height:1.25;letter-spacing:-0.025em">
                ${heading}
              </h1>

              <div style="font-size:14px;color:#55554f;line-height:1.7;margin:0 0 32px">
                ${body}
              </div>

              <!-- Primary CTA — dark ink, matching landing page button style -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:6px;background:#0d0c0b">
                    <a href="${ctaUrl}"
                       style="display:inline-block;padding:12px 22px;font-size:13.5px;
                              font-weight:500;color:#fafaf8;text-decoration:none;
                              border-radius:6px;letter-spacing:0.01em">
                      ${ctaText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Card footer strip -->
          <tr>
            <td style="padding:18px 40px 22px;border-top:1px solid #eeebe6">

              ${expiry ? `<p style="margin:0 0 10px;font-size:12px;color:#888882">
                &#x23F1;&nbsp; This link expires in <strong style="color:#55554f">${expiry}</strong>.
              </p>` : ''}

              <p style="margin:0;font-size:12px;color:#aaa9a4;line-height:1.6">
                ${footerNote}
              </p>

              <p style="margin:10px 0 0;font-size:11.5px;color:#c5c2bc;word-break:break-all;line-height:1.5">
                Button not working?
                <a href="${ctaUrl}" style="color:#888882;text-decoration:underline">${ctaUrl}</a>
              </p>

            </td>
          </tr>
        </table>

        <!-- Page footer -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:480px;margin-top:28px">
          <tr>
            <td style="border-top:1px solid #e8e4de;padding-top:20px">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <span style="font-size:12px;color:#55554f;font-family:Georgia,'Times New Roman',serif;
                                 letter-spacing:3px">COOKLYT</span>
                  </td>
                  <td align="right">
                    <span style="font-size:11.5px;color:#c5c2bc">&copy; ${year} CookLyt</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

async function sendVerificationEmail(to, token) {
  const link = `${APP_URL}/verify-email?token=${token}`;
  if (!isConfigured()) {
    console.log(`[email] SMTP not configured — skipping verification email to ${to}`);
    return;
  }
  await createTransporter().sendMail({
    from:    FROM,
    to,
    subject: 'Verify your CookLyt account',
    html: baseTemplate({
      heading:    'Verify your email address',
      body:       'Thanks for signing up. Please verify your email address to activate your CookLyt account and get full access.',
      ctaText:    'Verify Email',
      ctaUrl:     link,
      expiry:     '24 hours',
      footerNote: "If you didn't create a CookLyt account, you can safely ignore this email.",
    }),
  });
}

async function sendPasswordResetEmail(to, token) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  if (!isConfigured()) {
    console.log(`[email] SMTP not configured — skipping password reset email to ${to}`);
    return;
  }
  await createTransporter().sendMail({
    from:    FROM,
    to,
    subject: 'Reset your CookLyt password',
    html: baseTemplate({
      heading:    'Reset your password',
      body:       "We received a request to reset the password on your CookLyt account.<br/><br/>If this was you, click below. If not, you can safely ignore this email — your password will not be changed.",
      ctaText:    'Reset Password',
      ctaUrl:     link,
      expiry:     '1 hour',
      footerNote: 'For security, this link can only be used once.',
    }),
  });
}

async function sendAccountSetupEmail(to, token) {
  const link = `${APP_URL}/set-password?token=${token}`;
  if (!isConfigured()) {
    console.log(`[email] SMTP not configured — skipping account setup email to ${to}`);
    return;
  }
  await createTransporter().sendMail({
    from:    FROM,
    to,
    subject: "You've been invited to CookLyt",
    html: baseTemplate({
      heading:    "You've been invited",
      body:       `Your administrator has created a CookLyt account for <strong style="color:#0d0c0b">${to}</strong>.<br/><br/>Click below to set your own password and activate your account.`,
      ctaText:    'Set My Password',
      ctaUrl:     link,
      expiry:     '72 hours',
      footerNote: "If you weren't expecting this invitation, you can safely ignore this email.",
    }),
  });
}

async function sendAdminVerificationEmail(to, token) {
  const link = `${ADMIN_URL}/verify-email?token=${token}`;
  if (!isConfigured()) {
    console.log(`[email] SMTP not configured — skipping admin verification email to ${to}`);
    return;
  }
  await createTransporter().sendMail({
    from:    FROM,
    to,
    subject: 'Verify your Cooklyt Operator account',
    html: baseTemplate({
      heading:    'Verify your email address',
      body:       `You've been added as an operator on Cooklyt Admin. Please verify your email address to gain full access.`,
      ctaText:    'Verify Email',
      ctaUrl:     link,
      expiry:     '72 hours',
      footerNote: "If you weren't expecting this, you can safely ignore this email.",
    }),
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendAccountSetupEmail, sendAdminVerificationEmail };
