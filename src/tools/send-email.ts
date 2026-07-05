import type { APIRoute } from "astro";

/**
 * send_email tool definition
 * Calls POST /api/email/send to send emails via Resend
 */
export const sendEmailTool = {
  name: "send_email",
  description:
    "Send an outbound email via Resend. Use when the user asks to email someone directly.",
  inputSchema: {
    type: "object" as const,
    properties: {
      to: {
        type: "string",
        description: "Recipient email address",
      },
      subject: {
        type: "string",
        description: "Email subject line",
      },
      body: {
        type: "string",
        description: "Message body (plain text or HTML)",
      },
      cc: {
        type: "string",
        description: "Optional CC — comma-separated addresses",
      },
      bcc: {
        type: "string",
        description: "Optional BCC — comma-separated addresses",
      },
      from: {
        type: "string",
        description:
          "Optional From address (defaults to RESEND_FROM / company outbound email)",
      },
    },
    required: ["to", "subject", "body"],
  },
};
