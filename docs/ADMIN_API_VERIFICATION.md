# BentoBabu — Admin Frontend API Verification & Integration Audit

This document provides a comprehensive verification of all backend admin routes against the BentoBabu Admin Dashboard (`bentobabu-admin`) frontend client, services, and UI components.

---

## 1. Master API Verification Matrix

| # | Backend Endpoint | Method | Frontend Service Function | Frontend Page / Component | Auth Req. | Expected Request Format | Actual Response Handling | Verification Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/auth/login` | POST | `authService.login()` | `app/login/page.tsx` | Public | JSON: `{ email, password }` | Stores access token in `sessionStorage`; verifies `role === 'ADMIN'`; throws 403 if non-admin | ✅ Verified |
| 2 | `/api/v1/auth/me` | GET | `authService.getMe()` | `components/auth/AdminGuard.tsx`, `useAuth` | Bearer Token | Headers only | Rehydrates admin profile `{ id, name, email, role }`; enforces `ADMIN` role | ✅ Verified |
| 3 | `/api/v1/auth/refresh` | POST | Axios interceptor (`axios.ts`) | Background interceptor | Refresh Cookie / Token | Credentials: `same-origin` / cookie | Receives new `{ accessToken }`; updates in-flight queue and retries failed 401 requests | ✅ Verified |
| 4 | `/api/v1/auth/logout` | POST | `authService.logout()` | `components/layout/AdminHeader.tsx` | Bearer Token | Headers only | Invalidates session on server; clears `sessionStorage` and navigates to `/login` | ✅ Verified |
| 5 | `/api/v1/admin/dashboard/overview` | GET | `analyticsService.getOverview()` | `app/page.tsx` (Dashboard) | Admin | Query params: `period` (optional) | Extracts metrics: `totalRevenue`, `todayRevenue`, `totalOrders`, `todayOrders`, status breakdowns | ✅ Verified |
| 6 | `/api/v1/admin/dashboard/revenue` | GET | `analyticsService.getRevenue()` | `app/revenue/page.tsx`, `app/page.tsx` | Admin | Query: `?period=7d\|30d\|90d\|12m` | Parses timeline array, discounts, delivery fees, and AOV into Recharts revenue graphs | ✅ Verified |
| 7 | `/api/v1/admin/dashboard/orders` | GET | `analyticsService.getOrders()` | `app/orders/page.tsx`, `app/page.tsx` | Admin | Query: `?period=30d` | Extracts order trends, status percentages, and cancellation rates | ✅ Verified |
| 8 | `/api/v1/admin/dashboard/products` | GET | `analyticsService.getProducts()` | `app/products/page.tsx`, `app/page.tsx` | Admin | Query: `?period=30d` | Displays best-selling products list, low-stock warnings, and category volume | ✅ Verified |
| 9 | `/api/v1/admin/dashboard/customers` | GET | `analyticsService.getCustomers()` | `app/customers/page.tsx` | Admin | Query: `?period=30d` | Parses new vs returning customer ratios, order frequency, and top customers | ✅ Verified |
| 10 | `/api/v1/categories` | GET | `categoryService.getAll()` | `app/categories/page.tsx`, `app/products/page.tsx` | Public / Admin | Query: `?isActive=all` | Extracts `Category[]` array for category management list and product form selector | ✅ Verified |
| 11 | `/api/v1/categories` | POST | `categoryService.create()` | `app/categories/page.tsx` | Admin | JSON: `{ name, slug?, description?, image?, displayOrder?, isActive? }` | Validates created category and invalidates React Query cache | ✅ Verified |
| 12 | `/api/v1/categories/:id` | GET | `categoryService.getById()` | `app/categories/page.tsx` | Admin | URL Param: `id` | Maps single category details into edit modal | ✅ Verified |
| 13 | `/api/v1/categories/:id` | PATCH | `categoryService.update()` | `app/categories/page.tsx` | Admin | JSON: partial category fields | Updates category and invalidates React Query cache | ✅ Verified |
| 14 | `/api/v1/categories/:id/status` | PATCH | `categoryService.toggleStatus()` | `app/categories/page.tsx` | Admin | JSON: `{ isActive: boolean }` | Updates active state and triggers UI notification | ✅ Verified |
| 15 | `/api/v1/categories/:id` | DELETE | `categoryService.delete()` | `app/categories/page.tsx` | Admin | URL Param: `id` | Soft deletes category; removes from active list | ✅ Verified |
| 16 | `/api/v1/products` | GET | `productService.getAll()` | `app/products/page.tsx`, `app/inventory/page.tsx` | Public / Admin | Query: `?page=1&limit=50&category=...` | Extracts `Product[]` with pagination metadata; normalizes nutritional & dietary tags | ✅ Verified |
| 17 | `/api/v1/products` | POST | `productService.create()` | `app/products/page.tsx` | Admin | JSON: `{ name, slug, description, category, price, stockQuantity, ... }` | Maps frontend product model to backend schema; auto-resolves category slug to ObjectId | ✅ Verified |
| 18 | `/api/v1/products/:id` | GET | `productService.getById()` | `app/products/page.tsx` | Admin | URL Param: `id` | Maps product details including ingredients, allergens, and dietary tags | ✅ Verified |
| 19 | `/api/v1/products/:id` | PATCH | `productService.update()` | `app/products/page.tsx` | Admin | JSON: partial product updates | Updates product details and updates cache | ✅ Verified |
| 20 | `/api/v1/products/:id/status` | PATCH | `productService.toggleActive()` | `app/products/page.tsx` | Admin | JSON: `{ isActive: boolean }` | Toggles product active/archived state | ✅ Verified |
| 21 | `/api/v1/products/:id/availability` | PATCH | `productService.toggleAvailability()` | `app/products/page.tsx` | Admin | JSON: `{ isAvailable: boolean }` | Toggles immediate ordering availability | ✅ Verified |
| 22 | `/api/v1/products/:id/stock` | PATCH | `productService.updateStock()` | `app/products/page.tsx` | Admin | JSON: `{ stockQuantity: number }` | Updates stock quantity directly | ✅ Verified |
| 23 | `/api/v1/products/:id` | DELETE | `productService.delete()` | `app/products/page.tsx` | Admin | URL Param: `id` | Soft deletes product from backend catalog | ✅ Verified |
| 24 | `/api/v1/admin/inventory` | GET | `inventoryService.getAll()` | `app/inventory/page.tsx` | Admin | Query: `?status=ALL\|LOW_STOCK\|OUT_OF_STOCK` | Returns live inventory levels, thresholds, and availability indicators | ✅ Verified |
| 25 | `/api/v1/admin/inventory/:productId/adjust` | POST | `inventoryService.adjustStock()` | `app/inventory/page.tsx` | Admin | JSON: `{ adjustmentType: 'ADD'\|'REMOVE'\|'SET', quantity, reason }` | Performs atomic stock adjustment and logs audit entry | ✅ Verified |
| 26 | `/api/v1/admin/inventory/:productId/history` | GET | `inventoryService.getHistory()` | `app/inventory/page.tsx` (History Drawer) | Admin | URL Param: `productId` | Renders chronologically sorted audit log entries with user, reason, before & after | ✅ Verified |
| 27 | `/api/v1/admin/orders` | GET | `orderService.getAll()` | `app/orders/page.tsx`, `app/payments/page.tsx`, `app/reports/page.tsx` | Admin | Query: `?orderStatus=...&paymentStatus=...` | Returns orders array with customer, items snapshot, delivery slot, and address | ✅ Verified |
| 28 | `/api/v1/admin/orders/:id` | GET | `orderService.getById()` | `app/orders/page.tsx` (Order Details Drawer) | Admin | URL Param: `id` | Loads full order document including items, amounts, OTP status, and history | ✅ Verified |
| 29 | `/api/v1/admin/orders/:id/history` | GET | `orderService.getHistory()` | `app/orders/page.tsx` (Timeline Modal) | Admin | URL Param: `id` | Displays step-by-step transition timeline with timestamps, notes, and actors | ✅ Verified |
| 30 | `/api/v1/admin/orders/:id/assign-delivery` | PUT | `orderService.assignDelivery()` | `app/orders/page.tsx` | Admin | JSON: `{ deliveryPartnerId }` | Validates active `DELIVERY` role user and binds to order | ✅ Verified |
| 31 | `/api/v1/operations/kitchen/orders/:id/status` | PATCH | `orderService.updateKitchenStatus()` | `app/orders/page.tsx` | Kitchen / Admin | JSON: `{ status: 'PREPARING'\|'READY_FOR_PICKUP', note }` | Transitions kitchen lifecycle; dispatches notifications | ✅ Verified |
| 32 | `/api/v1/operations/delivery/orders/:id/status` | PATCH | `orderService.updateDeliveryStatus()` | `app/orders/page.tsx` | Delivery / Admin | JSON: `{ status: 'OUT_FOR_DELIVERY'\|'DELIVERED', otp?, note? }` | Manages rider dispatch and cryptographic OTP completion | ✅ Verified |
| 33 | `/api/v1/orders/:id/cancel` | PATCH | `orderService.cancel()` | `app/orders/page.tsx` | Admin | JSON: `{ reason }` | Restores inventory, releases slot reservation, and triggers refund if paid | ✅ Verified |
| 34 | `/api/v1/admin/users` | GET | `customerService.getAll()`, `userService.getStaff()` | `app/customers/page.tsx`, `app/staff/page.tsx` | Admin | Query: `?role=CUSTOMER` or `?role=KITCHEN,DELIVERY` | Returns filtered user lists with account status, contact info, and activity | ✅ Verified |
| 35 | `/api/v1/admin/users` | POST | `userService.createStaff()` | `app/staff/page.tsx` | Admin | JSON: `{ name, email, phone, role: 'KITCHEN'\|'DELIVERY', password }` | Enforces Indian 10-digit phone and valid staff role; creates staff user | ✅ Verified |
| 36 | `/api/v1/admin/users/:id/status` | PUT | `userService.updateStatus()` | `app/customers/page.tsx`, `app/staff/page.tsx` | Admin | JSON: `{ isActive: boolean }` | Toggles account active status; rejects self-deactivation | ✅ Verified |
| 37 | `/api/v1/admin/users/:id/role` | PUT | `userService.updateRole()` | `app/staff/page.tsx` | Admin | JSON: `{ role: 'KITCHEN'\|'DELIVERY'\|'ADMIN' }` | Updates staff role; prevents demotion of the last active administrator | ✅ Verified |
| 38 | `/api/v1/admin/delivery/zones` | GET | `deliveryService.getZones()` | `app/delivery/page.tsx` | Admin | None | Renders delivery zones table with PIN codes, delivery fee, and min order | ✅ Verified |
| 39 | `/api/v1/admin/delivery/zones` | POST | `deliveryService.createZone()` | `app/delivery/page.tsx` | Admin | JSON: `{ name, pincodes: string[], deliveryFee, minOrderAmount, ... }` | Creates zone; backend enforces 6-digit Indian PIN codes and uniqueness | ✅ Verified |
| 40 | `/api/v1/admin/delivery/zones/:id` | PUT | `deliveryService.updateZone()` | `app/delivery/page.tsx` | Admin | JSON: `{ name, pincodes, deliveryFee, minOrderAmount, ... }` | Updates zone settings and PIN code coverage | ✅ Verified |
| 41 | `/api/v1/admin/delivery/zones/:id/status` | PUT | `deliveryService.toggleZoneStatus()` | `app/delivery/page.tsx` | Admin | JSON: `{ isActive: boolean }` | Toggles zone serviceability | ✅ Verified |
| 42 | `/api/v1/admin/delivery/slots` | GET | `deliveryService.getSlots()` | `app/delivery/page.tsx` | Admin | Query: `?date=YYYY-MM-DD` | Returns daily delivery slots with capacity, booked count, and time windows | ✅ Verified |
| 43 | `/api/v1/admin/delivery/slots` | POST | `deliveryService.createSlot()` | `app/delivery/page.tsx` | Admin | JSON: `{ date, startTime, endTime, capacity, label }` | Creates delivery slot with duplicate window collision prevention | ✅ Verified |
| 44 | `/api/v1/admin/delivery/slots/:id` | PUT | `deliveryService.updateSlot()` | `app/delivery/page.tsx` | Admin | JSON: `{ capacity, label, startTime, endTime }` | Updates slot capacity; rejects capacity less than current bookings | ✅ Verified |
| 45 | `/api/v1/admin/delivery/slots/:id/status` | PUT | `deliveryService.toggleSlotStatus()` | `app/delivery/page.tsx` | Admin | JSON: `{ isActive: boolean }` | Toggles slot booking availability | ✅ Verified |
| 46 | `/api/v1/coupons` | GET | `couponService.getAll()` | `app/coupons/page.tsx` | Admin | None | Returns active & inactive coupons list | ✅ Verified |
| 47 | `/api/v1/coupons` | POST | `couponService.create()` | `app/coupons/page.tsx` | Admin | JSON: `{ code, discountType, discountValue, minOrderValue, ... }` | Creates promotional coupon with upper-case code formatting | ✅ Verified |
| 48 | `/api/v1/coupons/:id` | PATCH | `couponService.update()` | `app/coupons/page.tsx` | Admin | JSON: partial coupon fields | Updates discount rules, limits, or dates | ✅ Verified |
| 49 | `/api/v1/coupons/:id/status` | PATCH | `couponService.toggleStatus()` | `app/coupons/page.tsx` | Admin | JSON: `{ isActive: boolean }` | Toggles coupon validity | ✅ Verified |
| 50 | `/api/v1/coupons/:id` | DELETE | `couponService.delete()` | `app/coupons/page.tsx` | Admin | URL Param: `id` | Soft deletes coupon from system | ✅ Verified |
| 51 | `/api/v1/admin/settings` | GET | `settingsService.getAll()` | `app/settings/page.tsx` | Admin | None | Renders current key-value business configuration settings | ✅ Verified |
| 52 | `/api/v1/admin/settings` | PUT | `settingsService.update()` | `app/settings/page.tsx` | Admin | JSON: `{ settings: { [key]: value } }` | Updates allowlisted business configuration keys | ✅ Verified |
| 53 | `/api/v1/admin/notifications` | GET | `notificationService.getAll()` | `app/notifications/page.tsx` | Admin | Query: `?status=...&channel=...&page=...` | Displays notification log with status badges, channel icons, and retry details | ✅ Verified |
| 54 | `/api/v1/admin/notifications/stats` | GET | `notificationService.getStats()` | `app/notifications/page.tsx` | Admin | None | Returns KPI counters: Total, Sent, Failed, Pending, Success Rate | ✅ Verified |
| 55 | `/api/v1/admin/notifications/:id/retry` | POST | `notificationService.retry()` | `app/notifications/page.tsx` | Admin | URL Param: `id` | Enqueues failed notification for immediate re-dispatch; updates UI | ✅ Verified |

---

## 2. In-Depth Investigation: `/customers`, `/payments`, `/reports`, `/reviews`

### 2.1 `/customers` — Genuinely Integrated
- **Status:** **Fully Functional & Connected**
- **Backend API:** `GET /api/v1/admin/users?role=CUSTOMER` & `PUT /api/v1/admin/users/:id/status`
- **Verification Details:** The customer list is populated dynamically via `useAdminCustomers()`. Searching by name, phone, or email filters live backend users. Clicking the account status button fires a real `PUT /api/v1/admin/users/:id/status` request which activates or deactivates the customer account on MongoDB.

### 2.2 `/payments` — Genuinely Integrated
- **Status:** **Fully Functional & Connected**
- **Data Source:** Live backend order stream via `useAdminOrders()` (`GET /api/v1/admin/orders`)
- **Verification Details:** BentoBabu's backend does not maintain an isolated payment ledger table; payments are modeled directly within the `Order` schema (`paymentMethod`, `paymentStatus`, `paymentDetails`, `grandTotal`). The `/payments` page aggregates live transactions from `useAdminOrders()`, accurately separating online Razorpay payments and Cash-on-Delivery collections, tracking settlement statuses (`PAID`, `PENDING`, `REFUNDED`), and computing totals.

### 2.3 `/reports` — Genuinely Integrated
- **Status:** **Fully Functional & Connected**
- **Data Source:** Live data hooks `useAdminOrders()`, `useAdminProducts()`, `useAdminCustomers()`
- **Verification Details:** The `/reports` page computes live aggregate summaries from real backend database records. It enables 1-click CSV exports for:
  - *Sales Performance Report* (order numbers, customer names, payment statuses, grand totals)
  - *Product Inventory Report* (product names, category IDs, current stock, pricing)
  - *Customer Activity Report* (names, emails, phones, join dates)
  All CSV generators operate on live data fetched from the backend.

### 2.4 `/reviews` — Route Structure Present (Backend API Missing)
- **Status:** **UI Available with Local Fallback (Expected Finding)**
- **Root Cause Analysis:** In the authoritative BentoBabu backend specification (Phases 1–8), a Mongoose `Review` schema was defined in Phase 2 (`app/models/Review.js`), but **no Express controllers, routes, or endpoints for reviews were included in the Phase 1–8 roadmap**.
- **Frontend Handling:** `bentobabu-admin/services/reviewService.ts` gracefully returns a local state fallback to prevent rendering errors. An informational banner alerts administrators that the customer review moderation API will be activated in a subsequent backend release.

