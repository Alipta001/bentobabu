# BentoBabu — Delivery Partner Dashboard

A mobile-first, commercial-grade **Delivery Partner Dashboard** for BentoBabu, built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, and **Redux Toolkit**, inspired by the delivery agent experiences of Zomato and Swiggy.

---

## 🚀 Key Features

### 1. Dedicated Agent Authentication
- Email or 10-digit Indian mobile number login with password show/hide.
- Strict **RBAC Role Guard**: Immediately blocks `CUSTOMER`, `ADMIN`, and `KITCHEN` accounts from accessing delivery partner dashboards.
- Stateless JWT authentication with HttpOnly cookies, automatic CSRF token double-submit headers, and single-flight refresh token renewal.

### 2. Dashboard Overview (`/`)
- Prominent **Online / Offline** duty availability toggle with animated visual indicator.
- Real-time daily metrics: **Today's Deliveries**, **Today's Earnings**, **In-Progress Tasks**, and **Total Lifetime Deliveries**.
- Highlight card for in-progress active deliveries.
- Live incoming kitchen requests queue.

### 3. New Delivery Requests (`/requests`)
- Incoming orders ready at the central kitchen (`READY_FOR_PICKUP`).
- Order distance, delivery fee + incentive calculation, customer pincode, and order items.
- "Accept & Pickup" action and decline confirmation modal.

### 4. Active Deliveries (`/active`)
- List of all currently assigned deliveries (`OUT_FOR_DELIVERY`).
- Quick actions: One-tap phone dialer (`tel:`) to call customer, Google Maps route navigation, and OTP verification trigger.

### 5. Detailed Step-by-Step Delivery Execution (`/orders/[id]`)
- **Step 1: Assigned**: Assignment details and timing.
- **Step 2: Reach Kitchen**: Central cloud kitchen address, helpline, and route navigation.
- **Step 3: Confirm Pickup**: Button transitioning order to `OUT_FOR_DELIVERY` and generating customer OTP.
- **Step 4: Customer Destination**: Customer contact, full street address, landmark, Google Maps turn-by-turn route.
- **Step 5: Delivery OTP Verification**:
  - Secure 6-digit numeric input with auto-advance and paste support.
  - Backend validation against encrypted SHA-256 OTP hash on the order.
  - Rate limiting (max 5 attempts with remaining attempt alerts).
  - Atomic transition to `DELIVERED` and COD cash collection settlement.
- **Celebratory Success Screen**: Order summary, timestamp, and instant earnings credit.

### 6. Earnings Dashboard (`/earnings`)
- Real-time breakdown: Today, Last 7 Days, This Month, and Lifetime Totals.
- Guaranteed rider pay structure (₹50 base fee + ₹10 mileage/punctuality incentive).
- Order-by-order payout transaction ledger with payment method (COD cash collected vs online prepaid).

### 7. Delivery History (`/history`)
- Search by Order # or customer name.
- Pagination controls.
- Delivery completion time and earnings details.

### 8. Notifications Center (`/notifications`)
- Real-time alerts for new assignments, status updates, and payouts.
- Filter by All / Unread, with "Mark all as read" capability.

### 9. Profile & Fleet Vehicle Settings (`/profile`)
- Agent ID, verified partner badge, contact details.
- Vehicle specifications (Two-wheeler model, registration plate number, driving license number).
- Duty availability switch and secure sign out.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: Redux Toolkit & React-Redux
- **Server Cache & Polling**: TanStack React Query v5
- **Form Validation**: React Hook Form + Zod
- **HTTP Client**: Axios with CSRF & 401 refresh interceptors
- **Notifications**: Sonner

---

## 📦 Getting Started

### 1. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env.local
```

Configure `NEXT_PUBLIC_API_URL` to point to the BentoBabu backend:

```env
# Local Development:
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1

# Production Deployment:
NEXT_PUBLIC_API_URL=https://api.bentobabu.com/api/v1
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

The application runs on `http://localhost:3002`.

### 4. Build for Production

```bash
npm run build
npm start
```

---

## 🔒 Security & Delivery Business Rules

1. **OTP Verification Authority**: Delivery OTPs are generated and verified exclusively by the backend (`OrderOperationsController.updateDeliveryStatus`). The frontend never generates, stores, or displays the customer's secret OTP to the agent.
2. **Access Control**: Delivery agents can only view, accept, and verify orders in the delivery queue or assigned directly to their agent ID.
3. **Double Verification on COD**: Cash on Delivery orders clearly alert the agent to collect physical cash before entering the delivery OTP. Marking `DELIVERED` automatically marks the order payment status as `PAID`.
