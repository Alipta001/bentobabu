# BentoBabu — Customer Frontend Integration Documentation

## 1. Executive Summary

The BentoBabu customer frontend has been connected to the backend API.
All placeholder structures, mock datasets, and unlinked interactions across Authentication, Menu/Products, Cart, Addresses, Delivery Serviceability & Slot Booking, Checkout, Coupons, Razorpay & COD Payments, Live Order Tracking with OTP Handover, and Customer Notification Center have been implemented, tested, and verified.

---

## 2. Architecture & Design Alignment

### Frontend Stack
- **Framework**: Next.js 16.4.5 (App Router with Webpack)
- **Language**: TypeScript 5.8
- **UI Engine**: React 19, Tailwind CSS v4, Lucide React
- **State Management**: Redux Toolkit (client-side cart & sessions) + TanStack React Query v5 (server-side caching, invalidations & optimistic updates)
- **HTTP Client**: Axios with automated bearer token interception, token rotation, and refresh retries
- **Payment Gateway**: Razorpay Checkout SDK with server-side HMAC-SHA256 signature verification

### BentoBabu Design Palette
- **Warm Cream Background**: `#F7F3EA` / `#EDE8DE`
- **Forest Green Brand & Buttons**: `#354B35` / hover `#253525`
- **Accent Sand & Gold**: `#B99A60`
- **Borders & Dividers**: `#E5DFC5` / `#F0ECE1`
- **Text & Typography**: `#243324` / `#222922` / muted `#626F62`

---

## 3. End-to-End Feature & API Mapping

| Module / User Flow | Frontend Route / Component | Backend API Endpoint | Methods | Details |
|---|---|---|---|---|
| **Authentication & Profile** | `/login`, `/register`, `/account` | `/api/v1/auth/login`<br>`/api/v1/auth/register`<br>`/api/v1/auth/me`<br>`/api/v1/auth/logout`<br>`/api/v1/auth/refresh` | `POST`<br>`POST`<br>`GET`, `PATCH`<br>`POST`<br>`POST` | Cookie-based refresh tokens with client `accessToken` storage; profile name & phone updates with Indian mobile validation. |
| **Categories & Menu** | `/menu`, `/categories/[slug]` | `/api/v1/categories`<br>`/api/v1/categories/:slug` | `GET` | Category browsing, slug routing, fallback banner image handling. |
| **Product Catalogue & Search** | `/menu`, `/product/[slug]`, `ProductCard`, `ProductDetailView` | `/api/v1/products`<br>`/api/v1/products/:slug` | `GET` | Filtering by category, dietary tags (`VEG`, `NON_VEG`, `HIGH_PROTEIN`), max price slider, search keyword, sorting, pagination. |
| **Bidirectional Cart Sync** | `/cart`, `useCartSync` | `/api/v1/cart`<br>`/api/v1/cart/items`<br>`/api/v1/cart/items/:productId` | `GET`<br>`POST`<br>`PATCH`, `DELETE` | Automatic sync on mount & mutation between Redux store and authenticated customer's MongoDB Cart. |
| **Address Management** | `/checkout`, `/account` | `/api/v1/addresses`<br>`/api/v1/addresses/:id` | `GET`, `POST`<br>`PATCH`, `DELETE` | Complete Indian address schema (`fullName`, `phone`, `houseNo`, `street`, `landmark`, `city`, `state`, `pincode`, `addressType`, `isDefault`). |
| **Delivery Serviceability** | `ServiceabilityCheck`, `/checkout` | `/api/v1/delivery/serviceability?pincode=X` | `GET` | Real-time PIN code verification against active `DeliveryZone`, returns delivery fee, zone name, estimated delivery time. |
| **Delivery Slot Booking** | `DeliverySlotPicker`, `/checkout` | `/api/v1/delivery/slots?pincode=X&date=Y` | `GET` | 4-day date selector (`Today`, `Tomorrow`, `+2`, `+3`) with real-time capacity guards (`bookedCount < capacity`). |
| **Coupons & Promo Codes** | `/cart`, `/checkout` | `/api/v1/coupons/validate` | `POST` | Validates coupon expiry, minimum order threshold, per-customer limits, fixed vs percentage discounts. |
| **Checkout Summary** | `/checkout` | `/api/v1/orders/checkout-summary` | `POST` | Authoritative server calculation of `itemTotal`, `deliveryCharge`, `couponDiscount`, `taxAmount`, and `grandTotal`. |
| **Order Placement** | `/checkout` | `/api/v1/orders` | `POST` | Atomic creation with stock & slot reservations, coupon usage recording, and cart clearing. |
| **Razorpay Online Payment** | `/checkout` | `/api/v1/payments/razorpay/create-order`<br>`/api/v1/payments/razorpay/verify` | `POST`<br>`POST` | Opens official Razorpay modal; cryptographic signature verification with server-side HMAC-SHA256. |
| **Cash on Delivery (COD)** | `/checkout` | `/api/v1/payments/cod/confirm` | `POST` | Sets order to `CONFIRMED` with `COD_PENDING` payment status. |
| **Live Order Tracking** | `/orders/[id]` | `/api/v1/orders/:id`<br>`/api/v1/orders/:id/cancel` | `GET`<br>`PATCH` | 5-stage visual progress timeline (`CONFIRMED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY_FOR_PICKUP` $\rightarrow$ `OUT_FOR_DELIVERY` $\rightarrow$ `DELIVERED`). Displays secure 4-digit `deliveryOtp` when `OUT_FOR_DELIVERY`. In-flight cancellation modal with reason. |
| **Order Success & Receipt** | `/order-success/[id]` | `/api/v1/orders/:id` | `GET` | Order confirmation screen with direct action pills to track live progress and view order history. |
| **Notification Center** | `NotificationBell`, `/notifications` | `/api/v1/notifications`<br>`/api/v1/notifications/unread-count`<br>`/api/v1/notifications/:id/read`<br>`/api/v1/notifications/read-all`<br>`/api/v1/notifications/preferences` | `GET`<br>`GET`<br>`PATCH`<br>`PATCH`<br>`GET`, `PATCH` | Header notification bell with unread count badge, multi-channel filter tabs (All, In-App, Email, WhatsApp), mark-as-read, and channel opt-in/opt-out toggles. |

---

## 4. Key Services & Hooks Added / Refactored

1. `api/axios/axios.ts`:
   - Configured with `withCredentials: true`.
   - Intercepts 401 errors, auto-refreshes access tokens via `/auth/refresh`, and transparently replays original requests.
2. `services/authService.ts`:
   - Normalized user payloads; handles `updateProfile({ name, phone })`.
3. `services/productService.ts` & `categoryService.ts`:
   - Normalizes backend Mongoose documents (`_id`, `dietaryTags`, `images`, `stockQuantity`, `price`) to frontend interface models.
4. `services/cartService.ts`:
   - Communicates with `/cart` endpoints; provides `getCart()`, `addItem()`, `updateQuantity()`, `removeItem()`, `clearCart()`, `validateCoupon()`, `getCheckoutSummary()`.
5. `services/addressService.ts`:
   - Maps backend `Address` schema seamlessly to frontend address cards and modals.
6. `services/deliveryService.ts`:
   - Interfaces `/delivery/serviceability` and `/delivery/slots`.
7. `services/paymentService.ts`:
   - Handles Razorpay order creation, payment signature verification, and COD confirmation.
8. `services/notificationService.ts`:
   - Manages in-app notifications and customer communication preferences.
9. `hooks/useCartSync.ts`:
   - Synchronizes Redux local state with backend MongoDB cart for authenticated customers.
10. `hooks/useQueries.ts`:
    - Full suite of TanStack React Query hooks with automatic cache invalidation on order mutations.

---

## 5. Verification & Quality Assurance

### Frontend Production Build
- Command: `cd bentobabu-frontend && npm run build`
- Result: **Exit Code 0**
- Output: 15/15 static and dynamic pages generated without TypeScript or Webpack errors.

### Backend Regression Tests
- Command: `cd bentobabu-backend && npm test`
- Cumulative Result: **198/198 passing**
  - Phase 1 (Foundation & Infra): 10/10
  - Phase 2 (Models & Schemas): 9/9
  - Phase 3 (Auth & Roles): 23/23
  - Phase 4 (Catalog & Products): 31/31
  - Phase 5 (Address, Cart & Delivery): 37/37
  - Phase 6 (Coupons, Orders, Payments & Webhooks): 38/38
  - Phase 7 (Admin Dashboard & Settings): 29/29
  - Phase 8 (Notifications, Email & WhatsApp): 21/21

### Database Seeder
- Command: `cd bentobabu-backend && node seed.js`
- Populated:
  - 4 Categories (`Healthy Diet Bento`, `Gym & Fitness Bento`, `Kolkata Traditional Bento`, `Quick & Light Bento`)
  - 8 Handcrafted Products with full nutrition and ingredients
  - Delivery Zone: Barrackpore Central & Suburbs (PINs 700120–700123)
  - 16 Delivery Slots across today + next 3 days
  - 3 Verified Promo Coupons (`WELCOME50`, `BENTO100`, `HEALTHY20`)
  - Default business & platform system settings

