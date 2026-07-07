/**
 * Email receipt parser — extract dollar amounts from email bodies.
 * Fix: prioritize $ currency markers to avoid parsing invoice IDs as amounts.
 */

export function extractReceiptAmount(emailBody: string): number | null {
  if (!emailBody) return null;

  // Match currency amounts: $X.XX or $X,XXX.XX
  // Use word boundary and lookahead to avoid partial matches in IDs.
  const currencyMatch = emailBody.match(/\$\s*([\d,]+\.\d{2})\b/);
  
  if (currencyMatch && currencyMatch[1]) {
    const amountStr = currencyMatch[1].replace(/,/g, ''); // Remove commas
    const amount = parseFloat(amountStr);
    
    if (!isNaN(amount) && amount > 0) {
      return amount;
    }
  }

  return null;
}

/**
 * Parse receipt metadata from email.
 * Returns: { amount, date, vendor, receiptId }
 */
export function parseEmailReceipt(emailBody: string, subject: string) {
  const amount = extractReceiptAmount(emailBody);
  
  // Extract date (look for common patterns like "July 7, 2026" or "2026-07-07")
  const dateMatch = emailBody.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|(\d{4}-\d{2}-\d{2})/i);
  const date = dateMatch ? dateMatch[0] : null;

  // Vendor is typically near the start or after "Receipt from"
  const vendorMatch = emailBody.match(/(?:Receipt from|From:)\s*([A-Za-z\s,\.&]+?)(?:\s+#|\s*\$|$)/i);
  const vendor = vendorMatch ? vendorMatch[1].trim() : null;

  // Receipt/invoice ID (alphanumeric after # or in subject)
  const idMatch = emailBody.match(/#([0-9A-Z-]+)/);
  const receiptId = idMatch ? idMatch[1] : null;

  return {
    amount,
    date,
    vendor,
    receiptId
  };
}
