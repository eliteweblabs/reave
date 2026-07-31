/** CTIA / Telnyx 10DLC opt-in disclaimer and checkbox copy. */

export const SMS_USE_CASES = 'inquiry updates and appointment reminders';

export function smsConsentCheckboxLabel(brandName: string): string {
  return `I agree to receive SMS ${SMS_USE_CASES} from ${brandName}.`;
}

export function smsConsentDisclaimer(brandName: string): string {
  return `By providing your phone number, you agree to receive SMS ${SMS_USE_CASES} from ${brandName}. Message frequency may vary. Standard Message and Data Rates may apply. Reply STOP to opt out. Reply HELP for help. We will not share mobile information with third parties for promotional or marketing purposes.`;
}

/** One-time SMS sent immediately after a contact form SMS opt-in. */
export function smsOptInConfirmationMessage(brandName: string): string {
  return `${brandName}: You're subscribed to SMS ${SMS_USE_CASES}. Msg frequency varies. Msg&data rates may apply. Reply STOP to cancel, HELP for help.`;
}
