# Telegram Integration Enhancements v2

## Summary

This update implements all recommendations from the Telegram implementation analysis, significantly improving security, robustness, and interactivity of the notification system.

---

## Changes Implemented

### 1. ✅ Consistent HTML Escaping (Security - HIGH PRIORITY)

**Files Modified:** `src/lib/telegram.ts`

All notification templates now use `escapeHtml()` to prevent HTML injection attacks:

- `notifyNewOrder` - customer name, order ID, currency
- `notifyLowStock` - product name, SKU
- `notifyLowStockBatch` - product names, SKUs
- `notifyPaymentReceived` - customer name, currency, order ID
- `notifyDeliveryCompleted` - customer name, order ID, driver name
- `notifyReturnProcessed` - customer name, order ID, currency, reason
- `notifyDueDebt` - customer name, currency
- `notifyOrderApproved` - order number, customer name, currency, approvedBy
- `notifyOrderCancelled` - order number, customer name, currency, cancelledBy, reason
- `notifyOrderDelivered` - order number, customer name, driver name
- `notifyOrderReturned` - order number, customer name, currency, reason
- `notifyPaymentPartial` - order number, customer name, currency
- `notifyPaymentComplete` - order number, customer name, currency
- `notifyOrderCompleted` - order number, customer name, currency
- `notifyNewTenant` - tenant name, subdomain, plan
- `notifyNewUser` - user name, email, role, tenant name
- `notifyLoginLocked` - email, IP
- `notifySubscriptionExpiring` - tenant name, plan
- All customer notifications

### 2. ✅ Removed Duplicate `escapeHtml` Function

**Files Modified:** `src/routes/telegram-webhook.ts`

- Removed local duplicate of `escapeHtml` function
- Now imports from `src/lib/telegram.ts` for single source of truth

### 3. ✅ Bot Token Validation

**Files Modified:** 
- `src/lib/telegram.ts` - Added validation functions
- `src/routes/tenant-self.ts` - Validates tokens on save

New exports:
```typescript
export interface BotInfo { id, is_bot, first_name, username, ... }
export interface BotValidationResult { valid, botInfo?, error? }
export async function validateBotToken(botToken: string): Promise<BotValidationResult>
export async function validateTenantBot(tenantId: string): Promise<BotValidationResult>
```

**Behavior:**
- When a tenant saves a bot token via `PUT /tenant/telegram`, the token is validated with Telegram API
- Invalid tokens return a `400 INVALID_BOT_TOKEN` error
- New endpoint `POST /tenant/telegram/validate` allows validation without saving

### 4. ✅ Inline Keyboard Support

**Files Modified:** `src/lib/telegram.ts`

New types and utilities:
```typescript
export interface InlineKeyboardButton { text, callback_data?, url? }
export interface InlineKeyboardMarkup { inline_keyboard: InlineKeyboardButton[][] }
export function createInlineKeyboard(buttons: InlineKeyboardButton[][]): InlineKeyboardMarkup
export function createSingleRowKeyboard(...buttons: InlineKeyboardButton[]): InlineKeyboardMarkup
export function callbackButton(text: string, callbackData: string): InlineKeyboardButton
export function urlButton(text: string, url: string): InlineKeyboardButton
```

New notification functions with interactive buttons:
- `notifyCustomerOrderConfirmedWithActions` - "View Order" button
- `notifyCustomerDeliveredWithConfirmation` - "Confirm Receipt" / "Report Issue" buttons
- `notifyCustomerPaymentDueWithAction` - "Pay Now" / "Contact Support" buttons

### 5. ✅ Callback Query Handler

**Files Modified:** `src/routes/telegram-webhook.ts`

Added support for inline keyboard button presses:

**Updated Interface:**
```typescript
interface TelegramUpdate {
    update_id: number;
    message?: { ... };
    callback_query?: {
        id: string;
        from: { ... };
        message?: { message_id, chat, text };
        data?: string;
    };
}
```

**New Helper Functions:**
- `answerCallbackQuery(botToken, callbackQueryId, text?, showAlert?)` - Acknowledge button press
- `editMessage(botToken, chatId, messageId, text)` - Update message after action

**Supported Actions:**
| Callback Data | Action |
|--------------|--------|
| `confirm_delivery:{orderNumber}` | Customer confirms delivery receipt |
| `report_issue:{orderNumber}` | Customer reports delivery issue |
| `contact_support` | Shows support alert |
| `toggle_notification:{type}:{on/off}` | Toggle notification preferences |

### 6. ✅ Callback Data Parser

**Files Modified:** `src/lib/telegram.ts`

```typescript
export interface ParsedCallbackData { action: string; params: string[] }
export function parseCallbackData(callbackData: string): ParsedCallbackData
```

Format: `action:param1:param2:...`

### 7. ✅ Message Types Updated

**Files Modified:** `src/lib/telegram.ts`

`TelegramMessage` interface now supports:
```typescript
interface TelegramMessage {
    chatId: string;
    text: string;
    parseMode?: 'HTML' | 'Markdown';
    replyMarkup?: InlineKeyboardMarkup;  // NEW: Inline keyboard support
    logContext?: { ... };
}
```

---

## API Endpoints

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tenant/telegram/validate` | Validate a bot token without saving |

### Updated Endpoints

| Method | Endpoint | Changes |
|--------|----------|---------|
| PUT | `/tenant/telegram` | Now validates bot token before saving |

---

## Usage Examples

### Sending Interactive Notifications

```typescript
import { 
    notifyCustomerDeliveredWithConfirmation,
    notifyCustomerOrderConfirmedWithActions,
} from './lib/telegram';

// Order confirmation with "View Order" button
await notifyCustomerOrderConfirmedWithActions(
    tenantId,
    { chatId: customer.telegramChatId, name: customer.name },
    { orderNumber: 'ORD-001', total: 100000, currency: 'UZS', itemCount: 3 },
    'https://portal.yourstore.com'
);

// Delivery notification with confirmation buttons
await notifyCustomerDeliveredWithConfirmation(
    tenantId,
    { chatId: customer.telegramChatId, name: customer.name },
    { orderNumber: 'ORD-001', total: 100000, currency: 'UZS' }
);
```

### Custom Inline Keyboards

```typescript
import { 
    createInlineKeyboard, 
    callbackButton, 
    urlButton,
    sendToCustomerWithKeyboard 
} from './lib/telegram';

const keyboard = createInlineKeyboard([
    [callbackButton('✅ Accept', 'accept:123')],
    [urlButton('📄 View Invoice', 'https://example.com/invoice/123')],
]);

await sendToCustomerWithKeyboard(tenantId, chatId, 'Your message', keyboard);
```

### Validating Bot Tokens

```typescript
import { validateBotToken } from './lib/telegram';

const result = await validateBotToken('123456789:ABCdefGHIjklmnOPQRSTuvwxyz');
if (result.valid) {
    console.log(`Bot: @${result.botInfo.username}`);
} else {
    console.error(`Invalid token: ${result.error}`);
}
```

---

## Testing

1. **TypeScript Check:** `npm run typecheck`
   - ✅ Build successful (597 modules)

2. **Verify bot token validation:**
   - Try saving an invalid token → should return 400 error
   - Try saving a valid token → should succeed

3. **Test callback queries:**
   - Send a delivery notification with confirmation buttons
   - Click the buttons and verify the message updates

---

## Future Improvements (Not Yet Implemented)

1. **Redis-based Rate Limiting** - For multi-instance deployments
2. **Node-Cron Scheduler** - Replace `setInterval` with proper cron
3. **Localization/i18n** - Template system per tenant/locale
4. **Media Messages** - Product images, PDF invoices
5. **Chat State Management** - Multi-step conversations
6. **Notification Analytics Dashboard** - Delivery rates, engagement metrics
