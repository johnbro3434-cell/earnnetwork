function downloadCSV(data: any[], filename: string): void {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      let val = row[header];
      if (val === null || val === undefined) {
        val = '';
      } else if (typeof val === 'object') {
        val = JSON.stringify(val);
      } else {
        val = String(val);
      }
      val = val.replace(/"/g, '""');
      return `"${val}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportUsersToCSV(users: any[]): void {
  const formatted = (users || []).map(u => ({
    ID: u.id,
    Phone: u.phone,
    Role: u.role,
    Status: u.status,
    ReferralCode: u.referralCode,
    ReferredBy: u.referredBy || '',
    IsTrial: u.isTrial ? 'Yes' : 'No',
    FreeWithdrawAllowed: u.freeWithdrawAllowed ? 'Yes' : 'No',
    WithdrawMethod: u.withdrawMethod || '',
    WithdrawNumber: u.withdrawNumber || '',
    CreatedAt: u.createdAt,
    LastLoginAt: u.lastLoginAt || '',
  }));
  downloadCSV(formatted, 'EarnNetwork_Users');
}

export function exportDepositsToCSV(deposits: any[]): void {
  const formatted = (deposits || []).map(d => ({
    ID: d.id,
    UserID: d.userId,
    Phone: d.userPhone || '',
    Amount: d.amount,
    PaymentMethod: d.paymentMethod,
    SenderNumber: d.senderNumber,
    TransactionID: d.transactionId,
    Status: d.status,
    VerificationType: d.verificationType || '',
    CreatedAt: d.createdAt,
  }));
  downloadCSV(formatted, 'EarnNetwork_Deposits');
}

export function exportWithdrawalsToCSV(withdrawals: any[]): void {
  const formatted = (withdrawals || []).map(w => ({
    ID: w.id,
    UserID: w.userId,
    Phone: w.userPhone || '',
    Amount: w.amount,
    Fee: w.fee || 0,
    NetAmount: w.netAmount || w.amount,
    PaymentMethod: w.paymentMethod,
    WithdrawNumber: w.withdrawNumber,
    Status: w.status,
    IsTrialWithdraw: w.isTrialWithdraw ? 'Yes' : 'No',
    CreatedAt: w.createdAt,
  }));
  downloadCSV(formatted, 'EarnNetwork_Withdrawals');
}

export function exportWalletLedgerToCSV(ledger: any[]): void {
  const formatted = (ledger || []).map(l => ({
    ID: l.id,
    UserID: l.userId,
    Type: l.transactionType || l.type,
    Amount: l.amount,
    BalanceBefore: l.balanceBefore ?? '',
    BalanceAfter: l.balanceAfter ?? '',
    Reason: l.reason || l.description || '',
    CreatedBy: l.createdBy || 'system',
    CreatedAt: l.createdAt,
  }));
  downloadCSV(formatted, 'EarnNetwork_Wallet_Ledger');
}

export function exportAuditLogsToCSV(logs: any[]): void {
  const formatted = (logs || []).map(l => ({
    ID: l.id,
    Action: l.action,
    PerformedBy: l.adminName || l.performedBy || '',
    Role: l.adminRole || '',
    Target: l.target || '',
    Details: typeof l.details === 'object' ? JSON.stringify(l.details) : l.details || '',
    IP: l.ip || '',
    Timestamp: l.createdAt || l.timestamp,
  }));
  downloadCSV(formatted, 'EarnNetwork_Audit_Logs');
}
