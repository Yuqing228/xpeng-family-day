export function PaymentSteps() {
  return (
    <ol className="card payment-steps mt-4" aria-label="付款步骤">
      {['扫收款码', '输入金额', '确认扣款'].map((label, index) => (
        <li key={label}>
          <span className="payment-step-number" aria-hidden="true">{index + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
