/** First-boot sample inbox rows written by scripts/seed-demo.ts. */
export function isSeededInboxRecord(row: {
  id?: string | null;
  resendEmailId?: string | null;
  messageId?: string | null;
}): boolean {
  const id = row.id?.trim() ?? '';
  const resend = row.resendEmailId?.trim() ?? '';
  const messageId = row.messageId?.trim() ?? '';
  return (
    id.startsWith('demo-email-') ||
    resend.startsWith('demo-') ||
    messageId.startsWith('demo-msg-')
  );
}
