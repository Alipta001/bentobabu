# BentoBabu Backend — Phase 8: Customer Notifications, Email & WhatsApp Integration

## 1. Overview & Architecture

Phase 8 introduces a multi-channel customer notification subsystem for BentoBabu, supporting:
- **Email Notifications**: Delivered via SMTP with responsive HTML templates.
- **WhatsApp Notifications**: Meta WhatsApp Business Cloud API integration (disabled by default, strict opt-in consent).
- **In-App Notifications**: Real-time customer notifications queryable through protected REST APIs with unread counts and read-tracking.

### System Architecture Diagram
```
                     +---------------------------------------+
                     | Business Trigger (Order / Payment)   |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     | NotificationDispatcher.dispatch()     |
                     +---------------------------------------+
                                         |
               +-------------------------+-------------------------+
               |                         |                         |
               v                         v                         v
       [ IN_APP Channel ]        [ EMAIL Channel ]        [ WHATSAPP Channel ]
       - Always created          - Checks User opt-in     - Checks User opt-in (Explicit)
       - Direct status 'SENT'    - Pre-creates 'PENDING'  - Pre-creates 'PENDING'
       - Customer readable       - Renders HTML template  - Validates recipient phone
                                 - Dispatches via SMTP    - Calls Meta Cloud API
                                 - Updates 'SENT'/'FAILED'- Updates 'SENT'/'FAILED'/'SKIPPED'
```

---

## 2. Notification Model (`app/models/Notification.js`)

| Field | Type | Description |
|---|---|---|
| `user` | `ObjectId` | User reference (`User`) |
| `order` | `ObjectId` | Order reference (`Order`, optional) |
| `channel` | `String` | `'EMAIL'`, `'WHATSAPP'`, or `'IN_APP'` |
| `eventType` | `String` | One of the 10 supported business events |
| `recipient` | `String` | Email address, mobile phone number, or user ID |
| `subject` | `String` | Notification subject or summary heading |
| `message` | `String` | Plain text message or rendered notification body |
| `templateName` | `String` | Template identifier used for delivery |
| `status` | `String` | `'PENDING'`, `'PROCESSING'`, `'SENT'`, `'FAILED'`, `'SKIPPED'` |
| `isRead` | `Boolean` | Read state for in-app customer view |
| `providerMessageId` | `String` | External provider ID (Nodemailer messageId or Meta WhatsApp ID) |
| `idempotencyKey` | `String` | Unique key per channel, order/user, and event |
| `attempts` | `Number` | Current delivery attempts count |
| `maxAttempts` | `Number` | Maximum allowed attempts (default: 3) |
| `nextRetryAt` | `Date` | Next scheduled retry timestamp |
| `lastError` | `String` | Last sanitized error message |
| `sentAt` | `Date` | Timestamp of successful transmission |
| `metadata` | `Mixed` | Contextual order snapshot information |

---

## 3. Supported Notification Events & Template Mapping

| Event Type | Business Trigger | Email Subject | Meta WhatsApp Template |
|---|---|---|---|
| `ORDER_PLACED` | Order placed (Cash on Delivery or Razorpay) | Order Received Confirmation | `bentobabu_order_placed` |
| `PAYMENT_SUCCESS` | Razorpay signature verified / webhook captured | Payment Received Successfully | `bentobabu_payment_success` |
| `PAYMENT_FAILED` | Webhook `payment.failed` event | Payment Attempt Unsuccessful | `bentobabu_payment_failed` |
| `ORDER_CONFIRMED` | COD order confirmed or Online payment verified | Your BentoBabu Order is Confirmed | `bentobabu_order_confirmed` |
| `ORDER_PREPARING` | Kitchen moves status to `PREPARING` | Kitchen is Preparing Your Bento | `bentobabu_order_preparing` |
| `ORDER_READY` | Kitchen moves status to `READY_FOR_PICKUP` | Your Order is Packed & Ready | `bentobabu_order_ready` |
| `OUT_FOR_DELIVERY` | Rider dispatches order with OTP generated | Your Bento is Out for Delivery! 🛵 | `bentobabu_out_for_delivery` |
| `ORDER_DELIVERED` | Rider verifies delivery OTP | Order Delivered — Bon Appétit! 🎉 | `bentobabu_order_delivered` |
| `ORDER_CANCELLED` | Order self-cancelled or admin-cancelled | Order Cancellation Notice | `bentobabu_order_cancelled` |
| `ORDER_EXPIRED` | Unpaid order times out after payment window | Unpaid Order Expired | `bentobabu_order_expired` |

---

## 4. Email Integration & SMTP Configuration

The system uses [Nodemailer](https://nodemailer.com/) to send responsive HTML emails using table layouts compatible with major email clients (Gmail, Apple Mail, Outlook).

### Environment Variables
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=bentobabuofficial@gmail.com
SMTP_PASSWORD=your_email_app_password
EMAIL_FROM="BentoBabu <bentobabuofficial@gmail.com>"
```

- When `SMTP_HOST` is not configured (e.g. fresh local development or CI without credentials), email delivery is safely marked as `'SKIPPED'` without halting order placement.
- In automated test runs, `email.setTransporter(...)` allows mocking SMTP operations safely.

---

## 5. WhatsApp Integration (Meta WhatsApp Business Cloud API)

WhatsApp integration uses the official Meta WhatsApp Business Cloud API (`graph.facebook.com/v21.0/{phoneNumberId}/messages`).

### Environment Variables
```env
WHATSAPP_ENABLED=false
WHATSAPP_PHONE_NUMBER_ID=your_meta_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_meta_system_user_access_token
WHATSAPP_API_VERSION=v21.0
```

### Safety & Compliance Rules
1. **Disabled by default**: `WHATSAPP_ENABLED` must be explicitly `'true'` to send messages.
2. **Explicit Customer Consent**: Possession of a phone number is **never** treated as WhatsApp consent. A customer must explicitly toggle `notificationPreferences.whatsapp: true`. If opt-in is false, WhatsApp notifications are marked as `'SKIPPED'`.
3. **Approved Meta Templates**: Business-initiated transactional messages require pre-approved Meta message templates matching `WHATSAPP_TEMPLATE_MAP`.

---

## 6. Idempotency & Concurrency-Safe Retry Strategy

### Idempotency Keys
Every notification is assigned a unique idempotency key structured as:
- Email: `email_${orderId || userId}_${eventType}`
- WhatsApp: `wa_${orderId || userId}_${eventType}`
- In-App: `inapp_${orderId || userId}_${eventType}`

A unique database index (`idempotencyKey: 1, unique: true`) ensures that webhooks or repeated status transitions never deliver duplicate notifications.

### Concurrency-Safe Retry
Admin retries utilize atomic state transitions:
```javascript
const notification = await Notification.findOneAndUpdate(
  { _id: notificationId, status: 'FAILED' },
  { $set: { status: 'PROCESSING' } },
  { returnDocument: 'after' }
);
```
This guarantees that concurrent retry requests cannot trigger duplicate emails or WhatsApp API calls.

---

## 7. API Endpoints

### Customer Notification APIs (Requires Authentication)
- `GET /api/v1/notifications`: Paginated list of notifications for the authenticated user (`channel`, `isRead` filters).
- `GET /api/v1/notifications/unread-count`: Returns `{ unreadCount: number }`.
- `PATCH /api/v1/notifications/:id/read`: Marks a single notification as read.
- `PATCH /api/v1/notifications/read-all`: Marks all customer's unread notifications as read.
- `GET /api/v1/notifications/preferences`: Retrieves current customer notification preferences.
- `PATCH /api/v1/notifications/preferences`: Updates `{ email: boolean, whatsapp: boolean, inApp: boolean }`.

### Admin Notification APIs (Requires ADMIN Role)
- `GET /api/v1/admin/notifications`: Paginated auditing view with filters (`channel`, `status`, `eventType`, `userId`, `orderId`, date range).
- `GET /api/v1/admin/notifications/stats`: Aggregate counts by status, channel, and overall success rate.
- `GET /api/v1/admin/notifications/:id`: Detailed view with populated customer and order snapshots.
- `POST /api/v1/admin/notifications/:id/retry`: Concurrency-safe retry for failed notifications.

---

## 8. Testing Instructions

Run the Phase 8 test suite:
```bash
npm run test:phase8
```

Run the complete cumulative test suite (Phases 1–8):
```bash
npm test
```

All tests mock SMTP and WhatsApp API calls using `setTransporter()` and `setWhatsAppSender()`. No real emails or WhatsApp messages are sent during tests.

---

## 9. Production Deployment Checklist

- [ ] Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` with production email credentials.
- [ ] If WhatsApp is desired:
  - [ ] Create and verify a Meta WhatsApp Business account.
  - [ ] Create and obtain Meta approval for all 10 templates listed in Section 3.
  - [ ] Set `WHATSAPP_ENABLED=true`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_ACCESS_TOKEN`.
- [ ] Verify that MongoDB indexes for `Notification` (`idempotencyKey`, `user`, `status`) are initialized.
- [ ] Ensure customer consent UI clearly displays WhatsApp opt-in status.

