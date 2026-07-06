// Email classification and auto-routing rules
// Used by POST /api/email/triage to classify inbound messages

export type EmailStatus = 
  | "ROUTED"         // processed, cleared from inbox
  | "RECEIPT"        // tax/payment receipt, filed
  | "JUNK"           // spam, marked for deletion
  | "DELETE"         // permanently removed
  | "NOTIFY"         // unmatched, notify user
  | "RAILWAY_ALERT"  // Railway deployment alerts
  | "DOWN"           // UptimeRobot monitor alerts

export interface EmailRule {
  status: EmailStatus
  phrases: string[]        // phrases to match in subject/body
  fields: ("subject" | "body")[]
  notify: boolean          // send Telegram alert?
}

export const DEFAULT_RULES: EmailRule[] = [
  // UptimeRobot monitoring alerts
  {
    status: "DOWN",
    phrases: ["uptimerobot", "monitor is down", "monitor is up"],
    fields: ["subject"],
    notify: false,
  },

  // Railway deployment crash notifications
  {
    status: "RAILWAY_ALERT",
    phrases: ["build failed", "deployment crashed", "deploy crashed", "railway"],
    fields: ["subject", "body"],
    notify: false,
  },

  // Tax receipts and payment confirmations
  {
    status: "RECEIPT",
    phrases: ["invoice", "receipt", "payment", "charge", "transaction", "order"],
    fields: ["subject", "body"],
    notify: false,
  },

  // Auto-spam (phishing, obvious spam)
  {
    status: "JUNK",
    phrases: [
      "verify your account",
      "confirm your identity",
      "click here immediately",
      "urgent action required",
      "unsubscribe",
    ],
    fields: ["subject", "body"],
    notify: false,
  },
]

export function classifyEmail(
  subject: string,
  body: string,
  from: string
): EmailStatus {
  const text = `${subject} ${body}`.toLowerCase()

  // Check each rule in order
  for (const rule of DEFAULT_RULES) {
    for (const phrase of rule.phrases) {
      if (text.includes(phrase.toLowerCase())) {
        return rule.status
      }
    }
  }

  // No rule matched
  return "NOTIFY"
}

export function shouldNotify(status: EmailStatus): boolean {
  const rule = DEFAULT_RULES.find(r => r.status === status)
  return rule?.notify ?? true
}
