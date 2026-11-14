# BentoBabu — Customer Frontend Gap Analysis & Architecture Specification

## 1. Executive Summary

This document presents a comprehensive, component-by-component and endpoint-by-endpoint gap analysis between the existing **BentoBabu Customer Frontend** (`bentobabu-frontend`) and the completed **BentoBabu Backend** (`bentobabu-backend` Phases 1–8).

The frontend was originally constructed with a high-fidelity visual design, responsive layouts, and Tailwind CSS v4 styling, but relies heavily on local mock data (`src/lib/data/`), in-memory/localStorage state fallbacks, and placeholder endpoints (`/cart/validate`, `/cart/apply-coupon`) that do not match the real backend REST contracts.

---

## 2. Feature-by-Feature Gap Analysis

| Feature | Current Status | Backend API | Required Action |
|---|---|---|---|
| **Homepage** | Partial | `GET /api/v1/categories`, `GET /api/v1/products?isFeatured=true` | Replace hardcoded mock lists with real backend API queries; display live featured dishes and active categories. |
| **Authentication (Login/Register/Logout)** | Partial | `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `POST /api/v1/auth/logout` | Adapt response envelope `{ success, data: { user, accessToken } }`; remove mock user fallbacks; align phone/password validation rules. |
| **Session Restoration & Token Refresh** | Partial | `GET /api/v1/auth/me`, `POST /api/v1/auth/refresh` | Connect `axios` interceptor to unpack `{ data: { accessToken } }`; handle concurrent requests with refresh queue; clear session on 401. |
| **Product Catalogue** | Partial | `GET /api/v1/products` | Connect real backend query parameters (`category`, `dietaryTags`, `mealTypes`, `search`, `minPrice`, `maxPrice`, `sortBy`, `page`, `limit`); unwrap `{ data: { products, pagination } }`. |
| **Categories** | Partial | `GET /api/v1/categories`, `GET /api/v1/categories/:slug` | Wire dynamic category collections to real database categories; fix slug navigation and category details. |
| **Search and Filters** | Partial | `GET /api/v1/products?search=...` | Debounce search inputs; connect dietary tag filters (`VEG`, `NON_VEG`, `VEGAN`, `HIGH_PROTEIN`) and price range; reset pagination on filter change. |
| **Product Details** | Partial | `GET /api/v1/products/:slug` | Fetch product details by slug from backend; map real images, ingredients, allergens, preparation time, and nutritional macros; show stock availability. |
| **Shopping Cart** | Partial | `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/:productId`, `DELETE /api/v1/cart/items/:productId`, `DELETE /api/v1/cart` | Replace client-only Redux localStorage with authoritative backend Cart API sync; display server-calculated item totals and live stock. |
| **Addresses** | Partial | `GET /api/v1/addresses`, `POST /api/v1/addresses`, `PATCH /api/v1/addresses/:id`, `DELETE /api/v1/addresses/:id` | Replace Bengaluru mock addresses with real customer addresses; support `fullName`, `phone`, `addressLine`, `landmark`, `city`, `state`, `pincode`, `addressType`, `isDefault`. |
| **Delivery Serviceability** | Missing | `GET /api/v1/delivery/serviceability?pincode=...` | Create serviceability check component in checkout & cart; validate PIN code against active zones (e.g. Barrackpore 700120); display delivery fee and minimum order amount. |
| **Delivery Slots** | Missing | `GET /api/v1/delivery/slots?pincode=...&date=...` | Replace hardcoded text slot with dynamic slot selector querying available active slots for selected delivery date. |
| **Coupons** | Partial | `POST /api/v1/coupons/validate` | Replace client-side discount calculations with backend coupon validation endpoint; enforce minimum order value and per-user limits. |
| **Checkout Summary** | Missing | `POST /api/v1/orders/checkout-summary` | Implement checkout summary fetch before order placement; display backend authoritative `itemTotal`, `deliveryCharge`, `couponDiscount`, `taxAmount`, `grandTotal`. |
| **Order Placement** | Partial | `POST /api/v1/orders` | Connect real payload `{ addressId, deliverySlotId, couponCode, paymentMethod }`; handle backend validations (stock, slot capacity, minimum order amount). |
| **Razorpay Payments** | Partial | `POST /api/v1/payments/razorpay/create-order`, `POST /api/v1/payments/razorpay/verify` | Load Razorpay checkout script; initialize order via backend; verify HMAC signature on backend using `{ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }`. |
| **Cash on Delivery (COD)** | Partial | `POST /api/v1/payments/cod/confirm` | Confirm COD orders via backend endpoint; update order status to `CONFIRMED` and payment status to `COD_PENDING`. |
| **Order History** | Partial | `GET /api/v1/orders` | Fetch customer orders from backend; render order items, dates, grand totals, payment methods, and operational statuses. |
| **Order Tracking** | Missing | `GET /api/v1/orders/:id`, `PATCH /api/v1/orders/:id/cancel` | Build comprehensive order tracking page with visual status stepper (`CONFIRMED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY_FOR_PICKUP` $\rightarrow$ `OUT_FOR_DELIVERY` $\rightarrow$ `DELIVERED`), delivery OTP display, and cancellation workflow. |
| **Customer Profile** | Partial | `GET /api/v1/auth/me`, `PATCH /api/v1/auth/me` | Fetch live user details; implement edit profile form (name, phone); display account status. |
| **Notifications** | Missing | `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `PATCH /api/v1/notifications/:id/read`, `PATCH /api/v1/notifications/read-all`, `GET/PUT /api/v1/notifications/preferences` | Create notification dropdown/page with unread badge; mark-as-read actions; notification channel preferences (Email & WhatsApp opt-in toggle). |

---

## 3. Detailed Component & Service Audit

### 3.1 Components to Reuse Directly
- `Header` & `Footer` layouts (`components/layout/Header.tsx`, `Footer.tsx`): Excellent visual styling, responsive drawer, brand typography.
- `ProductCard` (`components/product/ProductCard.tsx`): Clean card layout, macro badge display, and add-to-cart buttons.
- `CategoryCard` (`components/category/CategoryCard.tsx`): Image presentation and slug links.
- `DietaryBadge` (`components/ui/DietaryBadge.tsx`): Clean visual indicator for vegetarian, vegan, and non-veg tags.
- `ProductDetailView` (`components/product/ProductDetailView.tsx`): Gallery viewer, quantity selectors, macro distribution cards, and ingredient lists.

### 3.2 Components Needing Modification
- **`Header.tsx`**: Add Notification Bell icon with dynamic unread count badge and quick dropdown / link to `/notifications`.
- **`ProductCard.tsx` & `ProductDetailView.tsx`**: Normalize data contracts (map `product.images[0]` to `imageUrl`, `product.nutrition` to `nutritionalInfo`, `product.dietaryTags` to dietary badge).
- **`cartSlice.ts` / Cart Context**: Sync cart additions, quantity updates, and deletions with backend Cart API (`/cart`) when user is logged in.
- **`CheckoutPage.tsx`**:
  - Remove hardcoded Bengaluru addresses and static slot text.
  - Integrate live PIN code serviceability check (`/delivery/serviceability`).
  - Integrate live delivery slot selector (`/delivery/slots`).
  - Integrate live checkout summary calculation (`/orders/checkout-summary`).
  - Submit order with `{ addressId, deliverySlotId, couponCode, paymentMethod }`.
- **`AccountPage.tsx`**:
  - Update address management modal to conform to backend schema (`fullName`, `addressLine`, `landmark`, `city`, `state`, `pincode`, `addressType`).
  - Add Profile Editing form (`PATCH /auth/me`).
  - Add Notification Preferences management (Email & WhatsApp opt-in).
  - Add direct links to live Order Tracking.

### 3.3 Components & Pages to Create
1. **`app/orders/[id]/page.tsx`**: Dedicated customer Order Tracking page with:
   - Real-time order progress timeline (`PENDING` / `CONFIRMED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY_FOR_PICKUP` $\rightarrow$ `OUT_FOR_DELIVERY` $\rightarrow$ `DELIVERED`).
   - Delivery OTP display box when status is `OUT_FOR_DELIVERY`.
   - Order cancellation modal with reason input (permitted only when status allows).
   - Order item snapshots, delivery address, and payment status breakdown.
2. **`app/notifications/page.tsx`**: Dedicated customer Notifications center with:
   - Filter tabs (All, Unread).
   - Individual "Mark as Read" and "Mark All as Read" actions.
   - Live unread notification counter.
   - Notification channel preference toggles (Email, WhatsApp opt-in consent).
3. **`components/checkout/DeliverySlotPicker.tsx`**: Interactive slot picker showing dates and active available time windows with booked capacity guards.
4. **`components/checkout/ServiceabilityCheck.tsx`**: Quick PIN code checker with instant delivery fee and minimum order amount feedback.
5. **`components/notifications/NotificationBell.tsx`**: Header notification bell with badge counter.

### 3.4 Backend API Compatibility & Database Seeding
- **Seed Data Required**: Because test suites clean up the test database, an idempotent database seed script (`npm run seed`) is needed in `bentobabu-backend` to ensure the database contains:
  - 4 active Categories (`Healthy Diet`, `Gym & Fitness`, `Office Professionals`, `Senior Citizens`).
  - 8+ wholesome Bento products with realistic images, nutritional macros, ingredients, and tags.
  - Delivery zones covering Barrackpore (PIN codes: `700120`, `700121`, `700122`, `700123`).
  - Active delivery slots for today and tomorrow.
  - Active promotional coupons (`WELCOME50`, `BENTO100`, `HEALTHY20`).
  - Operational business settings (`ORDER_ACCEPTANCE_ENABLED: true`, `MAINTENANCE_MODE: false`, `MINIMUM_ORDER_AMOUNT: 99`).
- **No Backend Contract Changes Required**: The backend APIs built in Phases 1–8 provide all necessary endpoints to fulfill the complete customer frontend journey without architectural modification.

---

## 4. Implementation Roadmap

1. **Database Seeding**: Create and execute `seed.js` in `bentobabu-backend` to populate initial categories, products, zones, slots, and coupons.
2. **Central API Architecture**: Upgrade `api/axios/axios.ts` and `api/endPoints/endPoints.ts` to cleanly unpack backend `{ success, data }` structures, coordinate token refresh, and handle standardized errors.
3. **Authentication & Session**: Upgrade `authService.ts` and auth hooks to properly store session tokens, fetch `/auth/me`, and manage profile updates.
4. **Catalogue & Menu**: Upgrade `productService.ts` and `categoryService.ts` to map backend products and categories directly into UI components.
5. **Cart Synchronization**: Implement backend cart integration in `cartService.ts` and Redux/state hooks to maintain parity between client and server.
6. **Addresses & Delivery**: Upgrade `addressService.ts` and build `deliveryService.ts` to support live address CRUD, serviceability checks, and slot selection.
7. **Checkout & Payments**: Refactor checkout flow to fetch server checkout summary, place orders, initialize Razorpay, and confirm COD.
8. **Orders & Tracking**: Build `orderService.ts` methods and create `app/orders/[id]/page.tsx` for real-time tracking, OTP delivery, and cancellation.
9. **Notifications**: Create `notificationService.ts`, `app/notifications/page.tsx`, and Header Notification Bell.
10. **Build & Test Verification**: Verify frontend build with `next build`, run end-to-end integration checks, and confirm backend regression tests pass.

