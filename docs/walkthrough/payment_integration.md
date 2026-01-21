# 💳 Payment Integration Walkthrough

This document outlines the payment integration system in IxaSales, allowing tenants to accept online payments via **Click** and **Payme**.

## 1. Overview

The system allows tenants to configure their own Click and Payme merchant credentials. When an order is created for a customer with a linked Telegram account, they receive a notification with a "Pay Now" button. This button leads to a branded, public payment portal where they can complete the transactions.

## 2. Configuration (Admin)

Navigate to **Settings > Payment Gateway** in the Admin panel.

### Toggle
- **Enable Payment Portal**: Switches the entire functionality on/off.

### Click Configuration
- **Merchant ID**: From Click Merchant Cabinet.
- **Service ID**: From Click Merchant Cabinet.
- **Secret Key**: Secure key for signature verification.
- **Webhook URL**: `https://api.ixasales.com/api/payment-gateway/webhook/click` (Must be set in Click Cabinet).

### Payme Configuration
- **Merchant ID**: From Payme Business.
- **Secret Key**: "Key" from Payme Business (for calculating signatures).
- **Webhook URL**: `https://api.ixasales.com/api/payment-gateway/webhook/payme` (Must be set in Payme Business).

## 3. The Payment Flow

1.  **Order Creation**:
    - A Sales Rep or Admin creates an order.
    - If the customer involves has a Telegram account linked (`telegramChatId`), the system automatically generates a unique **Payment Token**.

2.  **Notification**:
    - The customer receives a Telegram message:
      > ✅ **Buyurtma qabul qilindi!**
      > ...
      > [ 💳 Hozir to'lash ]
    - The button links to `https://{domain}/pay/{token}`.

3.  **Payment Portal**:
    - The customer sees a secure, public page showing:
      - Order # and Amount.
      - "Pay with Click" and "Pay with Payme" buttons (depending on tenant config).
    - Checks for validity (expiry, status).

4.  **Transaction**:
    - User clicks "Pay with Click" -> Redirects to Click interface.
    - User pays.
    - Click/Payme Server sends a **Webhook** to IxaSales.

5.  **Completion**:
    - Backend validates the webhook signature.
    - Updates `payment_tokens` status to `paid`.
    - Creates a record in `payments` table.
    - Updates `orders` payment status to `paid`.
    - Sends a receipt notification to the Customer and Admin on Telegram.

## 4. Technical Details

### Database
- **`payment_tokens`**: Stores the temporary link token, amount, and status.
- **`tenants`**: Stores encrypted merchant credentials.

### Security
- **Endpoints**: `/api/payment-gateway/webhook/*` are public but strictly validated via provider-specific signature algorithms.
- **Frontend**: The `/pay/:token` route is public but exposes limited information (Order #, Amount) and cannot be modified.

### Files
- `src/lib/payment-providers/*`: Core logic for URL generation and validation.
- `src/routes/payment-gateway.ts`: Webhook handlers.
- `client/src/pages/PaymentPortal.tsx`: Frontend UI.
