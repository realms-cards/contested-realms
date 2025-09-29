declare module 'nodemailer' {
  export interface MailOptions {
    to: string;
    from: string;
    subject: string;
    text?: string;
    html?: string;
  }

  export interface Transporter {
    sendMail(mailOptions: MailOptions): Promise<unknown>;
  }

  export function createTransport(options: unknown): Transporter;
}
