# 💳 Payment Integration Implementation Plan

**Created**: 2026-01-18  
**Status**: ✅ Implemented  
**Priority**: High  
**Implemented On**: 2026-01-18

---

## 📋 Overview

Implement online payment integration with **Click** and **Payme** - the two most popular payment providers in Uzbekistan, covering ~85% of the market.

### Goals
1. Allow customers to pay invoices via Telegram "Pay Now" button
2. Automatically update order status when payment is received
3. Send confirmation notifications to admin and customer
4. Multi-tenant support (each tenant has their own merchant account)

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Telegram Bot  │────▶│  Payment Portal  │────▶│  Click/Payme    │
│   "Pay Now" btn │     │  /pay/:token     │     │  Payment Page   │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼ (Webhook)
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Telegram Notif │◀────│   IxaSales API   │◀────│  POST /webhook  │
│  "Payment OK!"  │     │  Update Order    │     │  click/payme    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 📁 Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/routes/payment-gateway.ts` | Webhook handlers for Click/Payme |
| `src/lib/payment-providers/click.ts` | Click API integration |
| `src/lib/payment-providers/payme.ts` | Payme API integration |
| `src/lib/payment-providers/index.ts` | Unified payment interface |
| `client/src/pages/PaymentPortal.tsx` | Customer-facing payment page |

### Modified Files
| File | Changes |
|------|---------|
| `src/db/schema/tenants.ts` | Add payment provider credentials fields |
| `src/routes/tenant-self.ts` | Add payment settings endpoints |
| `src/lib/telegram.ts` | Add payment URL to customer notifications |
| `src/index.ts` | Register new routes |

---

## 🗄️ Database Schema Changes

### Add to `tenants` table:

```sql
-- Payment Gateway Configuration
ALTER TABLE tenants ADD COLUMN click_merchant_id VARCHAR(100);
ALTER TABLE tenants ADD COLUMN click_service_id VARCHAR(100);
ALTER TABLE tenants ADD COLUMN click_secret_key VARCHAR(255);
ALTER TABLE tenants ADD COLUMN payme_merchant_id VARCHAR(100);
ALTER TABLE tenants ADD COLUMN payme_secret_key VARCHAR(255);
ALTER TABLE tenants ADD COLUMN payment_portal_enabled BOOLEAN DEFAULT false;
```

### New `payment_tokens` table:

```sql
CREATE TABLE payment_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    token VARCHAR(64) UNIQUE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'UZS',
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid, expired, cancelled
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP,
    paid_via VARCHAR(20), -- 'click', 'payme'
    provider_transaction_id VARCHAR(100)
);
```

---

## 🔌 API Endpoints

### 1. Generate Payment Link
**POST** `/api/payments/create-link`

```typescript
// Request
{
    orderId: string;
    amount?: number; // Optional, defaults to order remaining balance
}

// Response
{
    success: true,
    data: {
        token: "abc123def456",
        portalUrl: "https://pay.ixasales.com/t/abc123def456",
        clickUrl: "https://my.click.uz/services/pay?...",
        paymeUrl: "https://checkout.paycom.uz/...",
        expiresAt: "2026-01-19T18:00:00Z",
        amount: 1250000,
        currency: "UZS"
    }
}
```

### 2. Get Payment Status
**GET** `/api/payments/status/:token`

```typescript
// Response
{
    success: true,
    data: {
        status: "pending" | "paid" | "expired",
        order: {
            orderNumber: "ORD-123",
            customerName: "Jamshid Karimov",
            amount: 1250000,
            currency: "UZS"
        }
    }
}
```

### 3. Click Webhook
**POST** `/api/webhooks/click`

Click sends two types of requests:
1. **Prepare** - Check if order exists
2. **Complete** - Confirm payment

```typescript
// Click Prepare Request
{
    click_trans_id: 12345,
    service_id: 123,
    click_paydoc_id: 67890,
    merchant_trans_id: "ORDER-123", // Our order reference
    amount: 1250000,
    action: 0, // 0 = prepare
    sign_time: "2026-01-18 18:00:00",
    sign_string: "md5hash..."
}

// Our Response
{
    click_trans_id: 12345,
    merchant_trans_id: "ORDER-123",
    merchant_prepare_id: 1, // Our internal ID
    error: 0, // 0 = success
    error_note: "Success"
}
```

### 4. Payme Webhook
**POST** `/api/webhooks/payme`

Payme uses JSON-RPC 2.0:

```typescript
// Payme Request
{
    method: "CheckPerformTransaction" | "CreateTransaction" | "PerformTransaction",
    params: {
        id: "payme_transaction_id",
        amount: 125000000, // In tiyin (x100)
        account: {
            order_id: "ORDER-123"
        }
    }
}

// Our Response
{
    result: {
        allow: true,
        // ... other fields based on method
    }
}
```

---

## 🔐 Security Requirements

### Click Signature Verification
```typescript
function verifyClickSignature(params: ClickRequest, secretKey: string): boolean {
    const signString = 
        params.click_trans_id +
        params.service_id +
        secretKey +
        params.merchant_trans_id +
        params.amount +
        params.action +
        params.sign_time;
    
    const expectedSign = md5(signString);
    return params.sign_string === expectedSign;
}
```

### Payme Signature Verification
```typescript
function verifyPaymeAuth(authHeader: string, merchantId: string, secretKey: string): boolean {
    const expected = Buffer.from(`Paycom:${secretKey}`).toString('base64');
    return authHeader === `Basic ${expected}`;
}
```

### Token Security
- Tokens are 64-character random strings (UUID v4 + random bytes)
- Tokens expire after 24 hours
- One-time use (marked as used after payment)
- Tied to specific order and amount

---

## 📱 Frontend: Payment Portal Page

### Route: `/pay/:token`

```tsx
// PaymentPortal.tsx
export function PaymentPortal() {
    const { token } = useParams();
    const [status, setStatus] = useState<'loading' | 'ready' | 'paid' | 'expired'>('loading');
    const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);

    useEffect(() => {
        fetch(`/api/payments/status/${token}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setOrderInfo(data.data.order);
                    setStatus(data.data.status === 'paid' ? 'paid' : 'ready');
                } else {
                    setStatus('expired');
                }
            });
    }, [token]);

    if (status === 'loading') return <LoadingSpinner />;
    if (status === 'expired') return <ExpiredMessage />;
    if (status === 'paid') return <SuccessMessage />;

    return (
        <div className="payment-portal">
            <div className="order-summary">
                <h1>To'lov</h1>
                <p>Buyurtma: #{orderInfo.orderNumber}</p>
                <p>Mijoz: {orderInfo.customerName}</p>
                <h2>{formatMoney(orderInfo.amount)} {orderInfo.currency}</h2>
            </div>
            
            <div className="payment-buttons">
                <a href={orderInfo.clickUrl} className="btn-click">
                    <img src="/click-logo.svg" alt="Click" />
                    Click orqali to'lash
                </a>
                <a href={orderInfo.paymeUrl} className="btn-payme">
                    <img src="/payme-logo.svg" alt="Payme" />
                    Payme orqali to'lash
                </a>
            </div>
        </div>
    );
}
```

---

## 📲 Telegram Integration

### Update Customer Notifications with Payment Button

```typescript
// In telegram.ts - notifyCustomerPaymentDue
export async function notifyCustomerPaymentDue(
    tenantId: string,
    customer: { chatId: string; name: string },
    debt: { totalDebt: number; currency: string; ... },
    paymentUrl?: string  // NEW: Optional payment link
): Promise<boolean> {
    const keyboard = paymentUrl ? createInlineKeyboard([
        [urlButton("💳 Hozir to'lash", paymentUrl)]
    ]) : undefined;

    return sendToCustomer(tenantId, customer.chatId,
        `⚠️ <b>To'lov eslatmasi</b>\n\n` +
        `Assalomu alaykum ${escapeHtml(customer.name)},\n\n` +
        `Sizda to'lanmagan qarz mavjud:\n\n` +
        `💰 Qarz: ${formatUzbekMoney(debt.totalDebt)} ${escapeHtml(debt.currency)}\n` +
        `📋 Buyurtmalar: ${debt.ordersCount} ta\n\n` +
        (paymentUrl ? `Quyidagi tugmani bosib to'lang 👇` : `Iltimos, imkon qadar tezroq to'lang.`),
        { tenantId, recipientType: 'customer', eventType: 'payment_due', recipientChatId: customer.chatId },
        keyboard
    );
}
```

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Token generation uniqueness
- [ ] Click signature verification
- [ ] Payme signature verification
- [ ] Token expiration logic
- [ ] Amount validation

### Integration Tests
- [ ] Create payment link flow
- [ ] Click prepare request handling
- [ ] Click complete request handling
- [ ] Payme CheckPerformTransaction
- [ ] Payme CreateTransaction
- [ ] Payme PerformTransaction
- [ ] Order status update after payment
- [ ] Telegram notification after payment

### Manual Testing
- [ ] Generate link via API
- [ ] Open payment portal page
- [ ] Click redirect works
- [ ] Payme redirect works
- [ ] Test with Click sandbox
- [ ] Test with Payme sandbox

---

## 📚 Official Documentation

| Provider | Docs URL |
|----------|----------|
| Click | https://docs.click.uz/en/ |
| Payme | https://developer.help.paycom.uz/ |

### Test Credentials
Both providers offer sandbox/test modes:
- **Click**: Use service_id `12345` and test cards
- **Payme**: Use test merchant ID and test card `8600 0000 0000 0001`

---

## 🚀 Implementation Order

1. **Database**: Add schema changes, run migrations
2. **Backend Core**: Create `payment-providers/` lib files
3. **API Routes**: Implement `/payments/create-link` and `/payments/status/:token`
4. **Webhooks**: Implement `/webhooks/click` and `/webhooks/payme`
5. **Frontend**: Create `PaymentPortal.tsx` page
6. **Settings**: Add tenant payment config UI
7. **Telegram**: Update notifications with payment buttons
8. **Testing**: Full flow testing with sandbox credentials

---

## 📝 Notes

- All amounts in Click are in **sum** (1 = 1 UZS)
- All amounts in Payme are in **tiyin** (100 = 1 UZS)
- Payment tokens should be UUID-based for security
- Consider adding retry logic for webhook failures
- Log all webhook requests for debugging

---

## ✅ Success Criteria

1. Tenant can configure Click/Payme credentials in settings
2. System generates unique payment links for orders
3. Customer receives Telegram message with "Pay Now" button
4. Clicking button opens simple payment portal
5. After payment, order automatically marked as paid
6. Both admin and customer receive confirmation
