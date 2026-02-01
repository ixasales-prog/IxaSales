/**
 * Email Service
 * 
 * Sends emails using SMTP (Gmail or custom provider).
 * Uses nodemailer-compatible approach.
 */

import { getEmailSettings } from './systemSettings';

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

/**
 * Send an email using configured SMTP settings.
 * 
 * For Gmail, you need an App Password:
 * 1. Enable 2-Factor Authentication in Gmail
 * 2. Go to Security → App Passwords
 * 3. Generate a password for "Mail"
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
    const settings = getEmailSettings();

    if (!settings.enabled) {
        console.log('[Email] Email sending is disabled');
        return false;
    }

    if (!settings.smtpHost || !settings.smtpUsername || !settings.smtpPassword) {
        console.log('[Email] SMTP not configured');
        return false;
    }

    try {
        // Use nodemailer if available, otherwise log
        // For production, you'd import nodemailer
        // For now, we'll use a simple SMTP approach

        const nodemailer = await import('nodemailer');

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpPort === 465,
            auth: {
                user: settings.smtpUsername,
                pass: settings.smtpPassword,
            },
        });

        await transporter.sendMail({
            from: `"${settings.fromName}" <${settings.fromEmail || settings.smtpUsername}>`,
            to: options.to,
            subject: options.subject,
            text: options.text || options.subject,
            html: options.html,
        });

        console.log('[Email] Sent to:', options.to);
        return true;
    } catch (error) {
        console.error('[Email] Failed to send:', error);
        return false;
    }
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

export function getPasswordResetEmail(resetUrl: string, userName: string): EmailOptions & { to: string } {
    return {
        to: '', // Set by caller
        subject: 'Reset Your Password - IxaSales',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
        h1 { font-size: 20px; color: #18181b; margin: 0 0 10px; }
        p { color: #52525b; line-height: 1.6; margin: 0 0 20px; }
        .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #a1a1aa; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">IxaSales</div>
        </div>
        <h1>Reset Your Password</h1>
        <p>Hi ${userName || 'there'},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <p style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" class="button">Reset Password</a>
        </p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <div class="footer">
            © 2026 IxaSales. All rights reserved.
        </div>
    </div>
</body>
</html>
        `.trim(),
        text: `Reset your password by visiting: ${resetUrl}`,
    };
}
