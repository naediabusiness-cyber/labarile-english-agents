import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { db } from "./db";
import { env, hasEnv } from "./env";

/** Accès IMAP (lecture) et SMTP (envoi) aux deux boîtes : commerciale (mail) et support. */

export type Mailbox = "mail" | "support";

const PREFIX: Record<Mailbox, string> = { mail: "MAIL", support: "SUPPORT" };

function cfg(box: Mailbox) {
  const p = PREFIX[box];
  return {
    imapHost: env(`${p}_IMAP_HOST`),
    imapPort: Number(env(`${p}_IMAP_PORT`) || 993),
    smtpHost: env(`${p}_SMTP_HOST`),
    smtpPort: Number(env(`${p}_SMTP_PORT`) || 465),
    user: env(`${p}_USER`),
    password: env(`${p}_PASSWORD`),
    fromName: env(`${p}_FROM_NAME`) || "Labarile English",
  };
}

export function mailboxReady(box: Mailbox): boolean {
  const p = PREFIX[box];
  return hasEnv(`${p}_IMAP_HOST`, `${p}_SMTP_HOST`, `${p}_USER`, `${p}_PASSWORD`);
}

export function mailboxAddress(box: Mailbox): string {
  return cfg(box).user;
}

export type IncomingMail = {
  uid: number;
  messageId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  text: string;
  date: Date;
  references: string[];
  automated: boolean;
};

/**
 * Les nouveaux messages depuis le dernier passage.
 * Au tout premier passage, on part de maintenant (on ne répond pas à l'historique).
 */
export async function fetchNew(box: Mailbox, max = 8): Promise<IncomingMail[]> {
  const c = cfg(box);
  const client = new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: c.imapPort === 993,
    auth: { user: c.user, pass: c.password },
    logger: false,
  });
  await client.connect();
  const out: IncomingMail[] = [];
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      if (!mb) return out;
      const { data: state } = await db().from("mail_state").select("*").eq("mailbox", box).maybeSingle();
      const validity = Number(mb.uidValidity);
      if (!state || Number(state.uid_validity) !== validity) {
        await db().from("mail_state").upsert({ mailbox: box, last_uid: Math.max(0, Number(mb.uidNext) - 1), uid_validity: validity });
        return out;
      }
      const from = Number(state.last_uid) + 1;
      if (from >= Number(mb.uidNext)) return out;
      let lastUid = Number(state.last_uid);
      for await (const msg of client.fetch(`${from}:*`, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= Number(state.last_uid) || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const fromAddr = parsed.from?.value?.[0];
        const headers = parsed.headers;
        const automated =
          !!headers.get("list-unsubscribe") ||
          /auto-(replied|generated)/i.test(String(headers.get("auto-submitted") ?? "")) ||
          /bulk|junk|list/i.test(String(headers.get("precedence") ?? "")) ||
          /no-?reply|mailer-daemon|postmaster/i.test(fromAddr?.address ?? "");
        const refs = parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : [];
        out.push({
          uid: msg.uid,
          messageId: parsed.messageId ?? `uid-${validity}-${msg.uid}`,
          fromEmail: (fromAddr?.address ?? "").toLowerCase(),
          fromName: fromAddr?.name ?? "",
          subject: parsed.subject ?? "",
          text: (parsed.text ?? "").slice(0, 20_000),
          date: parsed.date ?? new Date(),
          references: refs,
          automated,
        });
        lastUid = Math.max(lastUid, msg.uid);
        if (out.length >= max) break;
      }
      await db().from("mail_state").update({ last_uid: lastUid }).eq("mailbox", box);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}

export async function sendMail(
  box: Mailbox,
  opts: { to: string; subject: string; text: string; inReplyTo?: string; references?: string[] },
): Promise<string> {
  const c = cfg(box);
  const transport = nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpPort === 465,
    auth: { user: c.user, pass: c.password },
  });
  const info = await transport.sendMail({
    from: { name: c.fromName, address: c.user },
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    inReplyTo: opts.inReplyTo,
    references: opts.references?.length ? opts.references : opts.inReplyTo ? [opts.inReplyTo] : undefined,
  });
  return info.messageId;
}

export function replySubject(subject: string): string {
  return /^re\s*:/i.test(subject) ? subject : `Re: ${subject || "votre message"}`;
}

/** Les derniers échanges avec cette adresse, pour donner le contexte à l'agent. */
export async function threadContext(box: Mailbox, email: string, excludeId?: string): Promise<string> {
  const { data } = await db()
    .from("emails")
    .select("id,direction,subject,body,created_at")
    .eq("mailbox", box)
    .eq("from_email", email)
    .order("created_at", { ascending: false })
    .limit(6);
  return (data ?? [])
    .filter((e) => e.id !== excludeId)
    .reverse()
    .map((e) => `--- ${e.direction === "in" ? "REÇU" : "ENVOYÉ"} le ${new Date(e.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — ${e.subject}\n${(e.body ?? "").slice(0, 3000)}`)
    .join("\n\n");
}
