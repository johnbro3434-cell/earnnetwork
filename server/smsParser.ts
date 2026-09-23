/**
 * EARNHUB BD V20 — MFS SMS REGEX PARSER
 * Supports bKash & Nagad incoming receive-money / cash-in SMS formats.
 * Safely extracts TrxID, Amount, Sender Number, Balance, and SMS Time.
 * Ignores promotional SMS, OTPs, and debit/outgoing transactions.
 */

export interface ParsedSmsResult {
  isValid: boolean;
  method?: 'bKash' | 'Nagad';
  trxId?: string;
  amount?: number;
  senderNumber?: string;
  balanceAfter?: string;
  smsTime?: string;
  rawSms: string;
  error?: string;
}

/**
 * Normalizes Bangladesh phone number to 11 digits: e.g. 01712345678
 */
export function cleanBdPhone(phoneStr: string): string {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('01')) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith('8801')) {
    return digits.substring(2);
  }
  if (digits.length === 10 && digits.startsWith('1')) {
    return '0' + digits;
  }
  return digits;
}

/**
 * Clean numeric amounts (handles Tk 1,250.00 -> 1250)
 */
export function cleanAmount(amountStr: string): number {
  if (!amountStr) return 0;
  const cleaned = amountStr.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Parses raw SMS text and extracts financial receive details
 */
export function parseMfsSms(rawSms: string): ParsedSmsResult {
  if (!rawSms || typeof rawSms !== 'string' || rawSms.trim().length === 0) {
    return { isValid: false, rawSms: rawSms || '', error: 'Empty SMS content' };
  }

  const text = rawSms.trim();

  // 1. Check & Ignore OTPs or security codes
  if (
    /\b(OTP|verification code|security code|PIN|do not share|one time password)\b/i.test(text)
  ) {
    return { isValid: false, rawSms: text, error: 'Ignored: OTP / Security SMS' };
  }

  // 2. Check & Ignore outgoing / debit SMS (Payment, Cash Out, Send Money to)
  if (
    /\b(Payment of Tk|Cash Out of Tk|Cash Out Tk|Send Money to Tk|Fee of Tk|Paid Tk|successful payment)\b/i.test(text)
  ) {
    return { isValid: false, rawSms: text, error: 'Ignored: Outgoing debit transaction' };
  }

  // 3. Check & Ignore promotional marketing SMS
  if (
    /\b(offer|cashback offer|win|bonus offer|dial \*|recharge offer|discount)\b/i.test(text) &&
    !/\b(TrxID|TxnID)\b/i.test(text)
  ) {
    return { isValid: false, rawSms: text, error: 'Ignored: Promotional message' };
  }

  // ==========================================
  // PARSER 1: bKash Incoming SMS Formats
  // ==========================================
  // Format A: "You have received Tk 500.00 from 017XXXXXXXX. Ref . Fee Tk 0.00. Balance Tk 1,250.00. TrxID 9K28SA710P at 22/09/2026 14:30"
  // Format B: "You have received deposit of Tk 1,000.00 from 018XXXXXXXX. Fee Tk 0.00. Balance Tk 5,420.00. TrxID BL7A902KQ1"
  // Format C: "Cash In Tk 2,500.00 from 019XXXXXXXX successful. Fee Tk 0.00. Balance Tk 10,250.00. TrxID 8A91KL02ZQ"
  if (/\b(bKash|TrxID)\b/i.test(text) || (text.includes('received') && text.includes('TrxID'))) {
    // Regex for TrxID in bKash (alphanumeric, 8 to 14 chars)
    const trxMatch = text.match(/TrxID\s*[:\s]?\s*([A-Z0-9]{6,16})/i);
    // Regex for amount received
    const amountMatch = text.match(/(?:received(?: deposit of)?|Cash In)\s+Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    // Regex for sender phone number
    const senderMatch = text.match(/from\s+(01[3-9][0-9]{8}|8801[3-9][0-9]{8})/i);
    // Regex for balance after
    const balanceMatch = text.match(/Balance\s+Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    // Regex for time
    const timeMatch = text.match(/at\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2,4}\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i);

    if (trxMatch && amountMatch) {
      const trxId = trxMatch[1].trim().toUpperCase();
      const amount = cleanAmount(amountMatch[1]);
      const senderNumber = senderMatch ? cleanBdPhone(senderMatch[1]) : '';
      const balanceAfter = balanceMatch ? balanceMatch[1] : undefined;
      const smsTime = timeMatch ? timeMatch[1] : new Date().toISOString();

      return {
        isValid: true,
        method: 'bKash',
        trxId,
        amount,
        senderNumber,
        balanceAfter,
        smsTime,
        rawSms: text,
      };
    }
  }

  // ==========================================
  // PARSER 2: Nagad Incoming SMS Formats
  // ==========================================
  // Format A: "Cash In of Tk 500.00 from 019XXXXXXXX received. Balance: Tk 2,300.00. TxnID: 72KB901P at 22/09/2026 15:45"
  // Format B: "You have received Tk 2,500.00 from 016XXXXXXXX. Ref: 0. Balance: Tk 12,500.00. TxnID: NAG882910K"
  // Format C: "Deposit of Tk 1,000.00 from 017XXXXXXXX successful. TxnID: 98KA8810"
  if (/\b(Nagad|TxnID)\b/i.test(text) || (text.includes('received') && text.includes('TxnID'))) {
    // Regex for TxnID in Nagad (alphanumeric, 6 to 16 chars)
    const txnMatch = text.match(/TxnID\s*[:\s]?\s*([A-Z0-9]{6,16})/i);
    // Regex for amount
    const amountMatch = text.match(/(?:Cash In of|received|Deposit of)\s+Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    // Regex for sender
    const senderMatch = text.match(/from\s+(01[3-9][0-9]{8}|8801[3-9][0-9]{8})/i);
    // Regex for balance
    const balanceMatch = text.match(/Balance\s*:\s*Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    // Regex for time
    const timeMatch = text.match(/at\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2,4}\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i);

    if (txnMatch && amountMatch) {
      const trxId = txnMatch[1].trim().toUpperCase();
      const amount = cleanAmount(amountMatch[1]);
      const senderNumber = senderMatch ? cleanBdPhone(senderMatch[1]) : '';
      const balanceAfter = balanceMatch ? balanceMatch[1] : undefined;
      const smsTime = timeMatch ? timeMatch[1] : new Date().toISOString();

      return {
        isValid: true,
        method: 'Nagad',
        trxId,
        amount,
        senderNumber,
        balanceAfter,
        smsTime,
        rawSms: text,
      };
    }
  }

  // Generic fallback if text has TrxID/TxnID and Amount
  const genericTrx = text.match(/(?:TrxID|TxnID|TRX|TXN)\s*[:\s]?\s*([A-Z0-9]{6,16})/i);
  const genericAmount = text.match(/(?:Tk|BDT|Amount)\s*[:\s]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  const genericSender = text.match(/(?:from|sender)\s*[:\s]?\s*(01[3-9][0-9]{8})/i);

  if (genericTrx && genericAmount) {
    const isNagad = /Nagad|TxnID/i.test(text);
    return {
      isValid: true,
      method: isNagad ? 'Nagad' : 'bKash',
      trxId: genericTrx[1].trim().toUpperCase(),
      amount: cleanAmount(genericAmount[1]),
      senderNumber: genericSender ? cleanBdPhone(genericSender[1]) : '',
      rawSms: text,
      smsTime: new Date().toISOString(),
    };
  }

  return {
    isValid: false,
    rawSms: text,
    error: 'Unrecognized SMS format. Could not reliably extract Transaction ID and Amount.',
  };
}
