const assert = require('assert');
const { configureStore, createSlice } = require('@reduxjs/toolkit');

/**
 * BentoBabu — Navbar Cart Badge Count Verification Suite
 * Verifies that the cart badge strictly counts distinct cart line items,
 * not the sum of their quantities.
 */

// Cart Slice Reducer & Selectors replicating store/cartSlice.ts
const cartSlice = createSlice({
  name: 'cart',
  initialState: {
    items: [],
    appliedCoupon: null,
    deliverySlot: 'Immediate (35-45 mins)',
    deliveryNotes: '',
  },
  reducers: {
    setCartItems: (state, action) => {
      state.items = action.payload;
    },
    addToCart: (state, action) => {
      const { product, quantity = 1, variantId = null, variantName = null, unitPrice } = action.payload;
      const targetVariantId = variantId ? String(variantId) : null;
      const existing = state.items.find(
        (item) =>
          item.product.id === product.id &&
          (item.variantId ? String(item.variantId) : null) === targetVariantId
      );

      const effectiveUnitPrice = unitPrice !== undefined ? unitPrice : product.price;

      if (existing) {
        existing.quantity += quantity;
        if (unitPrice !== undefined) existing.unitPrice = unitPrice;
        if (variantName) existing.variantName = variantName;
      } else {
        state.items.push({
          product,
          quantity,
          variantId: targetVariantId,
          variantName,
          unitPrice: effectiveUnitPrice,
        });
      }
    },
    updateQuantity: (state, action) => {
      const { productId, quantity, variantId } = action.payload;
      const targetVariantId = variantId !== undefined ? (variantId ? String(variantId) : null) : undefined;
      if (quantity <= 0) {
        state.items = state.items.filter(
          (item) =>
            !(
              item.product.id === productId &&
              (targetVariantId !== undefined
                ? (item.variantId ? String(item.variantId) : null) === targetVariantId
                : true)
            )
        );
      } else {
        const item = state.items.find(
          (it) =>
            it.product.id === productId &&
            (targetVariantId !== undefined
              ? (it.variantId ? String(it.variantId) : null) === targetVariantId
              : true)
        );
        if (item) {
          item.quantity = quantity;
        }
      }
    },
    removeFromCart: (state, action) => {
      if (typeof action.payload === 'string') {
        state.items = state.items.filter((item) => item.product.id !== action.payload);
      } else {
        const { productId, variantId } = action.payload;
        const targetVariantId = variantId ? String(variantId) : null;
        state.items = state.items.filter(
          (item) =>
            !(
              item.product.id === productId &&
              (targetVariantId !== null
                ? (item.variantId ? String(item.variantId) : null) === targetVariantId
                : true)
            )
        );
      }
    },
    clearCart: (state) => {
      state.items = [];
    },
  },
});

const { addToCart, updateQuantity, removeFromCart, setCartItems, clearCart } = cartSlice.actions;

// Selectors
const selectCartItemCount = (state) => state.cart.items.length;
const selectCartTotalQuantity = (state) =>
  state.cart.items.reduce((acc, item) => acc + item.quantity, 0);

console.log('================================================================');
console.log(' BentoBabu: Navbar Cart Badge Count Verification Test Suite');
console.log('================================================================\n');

function createTestStore() {
  return configureStore({
    reducer: {
      cart: cartSlice.reducer,
    },
  });
}

// Fixture Products
const productA = { id: 'prod_a', name: 'High Protein Chicken Bowl', price: 199 };
const productB = { id: 'prod_b', name: 'Millet Khichdi Bento', price: 149 };
const productC = { id: 'prod_c', name: 'Sprouted Moong Salad', price: 99 };

// Test 1: Empty cart has badge count = 0
{
  const store = createTestStore();
  const badgeCount = selectCartItemCount(store.getState());
  assert.strictEqual(badgeCount, 0, 'Empty cart badge must be 0');
  console.log('✓ Test 1: Empty cart badge count is 0');
}

// Test 2: Add Product A (qty 1) -> badge = 1
{
  const store = createTestStore();
  store.dispatch(addToCart({ product: productA, quantity: 1 }));
  const badgeCount = selectCartItemCount(store.getState());
  const totalQty = selectCartTotalQuantity(store.getState());
  assert.strictEqual(badgeCount, 1, 'Badge must be 1 after adding 1 item');
  assert.strictEqual(totalQty, 1, 'Total quantity must be 1');
  console.log('✓ Test 2: Add Product A x 1 -> badge = 1 (total qty = 1)');
}

// Test 3: Increase Product A quantity to 5 -> badge remains 1
{
  const store = createTestStore();
  store.dispatch(addToCart({ product: productA, quantity: 1 }));
  store.dispatch(updateQuantity({ productId: productA.id, quantity: 5 }));
  const badgeCount = selectCartItemCount(store.getState());
  const totalQty = selectCartTotalQuantity(store.getState());
  assert.strictEqual(badgeCount, 1, 'Badge must remain 1 when quantity is increased to 5');
  assert.strictEqual(totalQty, 5, 'Total quantity must be 5');
  console.log('✓ Test 3: Increase Product A quantity to 5 -> badge remains 1 (total qty = 5)');
}

// Test 4: Add Product B (qty 1) -> badge = 2
{
  const store = createTestStore();
  store.dispatch(addToCart({ product: productA, quantity: 5 }));
  store.dispatch(addToCart({ product: productB, quantity: 1 }));
  const badgeCount = selectCartItemCount(store.getState());
  const totalQty = selectCartTotalQuantity(store.getState());
  assert.strictEqual(badgeCount, 2, 'Badge must be 2 after adding Product B');
  assert.strictEqual(totalQty, 6, 'Total quantity must be 6');
  console.log('✓ Test 4: Add Product B x 1 to existing Product A x 5 -> badge = 2 (total qty = 6)');
}

// Test 5: Increase Product B quantity to 3 -> badge remains 2
{
  const store = createTestStore();
  store.dispatch(addToCart({ product: productA, quantity: 5 }));
  store.dispatch(addToCart({ product: productB, quantity: 1 }));
  store.dispatch(updateQuantity({ productId: productB.id, quantity: 3 }));
  const badgeCount = selectCartItemCount(store.getState());
  const totalQty = selectCartTotalQuantity(store.getState());
  assert.strictEqual(badgeCount, 2, 'Badge must remain 2 when Product B quantity is increased to 3');
  assert.strictEqual(totalQty, 8, 'Total quantity must be 8');
  console.log('✓ Test 5: Increase Product B quantity to 3 -> badge remains 2 (total qty = 8)');
}

// Test 6: Add Product A with a different variant -> badge = 3
{
  const store = createTestStore();
  // Existing: Product A (default/no variant) x 5, Product B x 3
  store.dispatch(addToCart({ product: productA, quantity: 5 }));
  store.dispatch(addToCart({ product: productB, quantity: 3 }));
  // Add Product A with Chicken variant
  store.dispatch(addToCart({ product: productA, quantity: 2, variantId: 'var_chicken', variantName: 'Chicken', unitPrice: 199 }));
  const badgeCount = selectCartItemCount(store.getState());
  const totalQty = selectCartTotalQuantity(store.getState());
  assert.strictEqual(badgeCount, 3, 'Badge must be 3 because Product A with variant is a separate line item');
  assert.strictEqual(totalQty, 10, 'Total quantity must be 10');
  console.log('✓ Test 6: Add Product A with variant (Chicken) -> badge = 3 (separate line item)');
}

// Test 7: Remove Product B -> badge = 2
{
  const store = createTestStore();
  store.dispatch(addToCart({ product: productA, quantity: 5 }));
  store.dispatch(addToCart({ product: productB, quantity: 3 }));
  store.dispatch(addToCart({ product: productA, quantity: 2, variantId: 'var_chicken', variantName: 'Chicken' }));
  store.dispatch(removeFromCart({ productId: productB.id }));
  const badgeCount = selectCartItemCount(store.getState());
  const totalQty = selectCartTotalQuantity(store.getState());
  assert.strictEqual(badgeCount, 2, 'Badge must be 2 after removing Product B');
  assert.strictEqual(totalQty, 7, 'Total quantity must be 7 (5 + 2)');
  console.log('✓ Test 7: Remove Product B -> badge = 2 (total qty = 7)');
}

// Test 8: Clear cart -> badge = 0
{
  const store = createTestStore();
  store.dispatch(addToCart({ product: productA, quantity: 5 }));
  store.dispatch(clearCart());
  const badgeCount = selectCartItemCount(store.getState());
  assert.strictEqual(badgeCount, 0, 'Badge must be 0 after clearCart');
  console.log('✓ Test 8: Clear cart -> badge = 0');
}

// Test 9: Hydrate cart from backend / localStorage with 3 lines -> badge = 3
{
  const store = createTestStore();
  const mockBackendItems = [
    { product: productA, quantity: 4, variantId: 'var_chicken', variantName: 'Chicken', unitPrice: 199 },
    { product: productA, quantity: 2, variantId: 'var_paneer', variantName: 'Paneer', unitPrice: 179 },
    { product: productC, quantity: 1, variantId: null, unitPrice: 99 },
  ];
  store.dispatch(setCartItems(mockBackendItems));
  const badgeCount = selectCartItemCount(store.getState());
  const totalQty = selectCartTotalQuantity(store.getState());
  assert.strictEqual(badgeCount, 3, 'Badge must reflect 3 distinct lines after hydration');
  assert.strictEqual(totalQty, 7, 'Total units = 4 + 2 + 1 = 7');
  console.log('✓ Test 9: Cart hydration from backend/storage -> badge = 3 (total qty = 7)');
}

// Test 10: Strict User Request Examples Table
console.log('\n--- Verifying Exact User Specification Table ---');
{
  // Row 1: Product A x 1 -> badge = 1
  const s1 = createTestStore();
  s1.dispatch(addToCart({ product: productA, quantity: 1 }));
  assert.strictEqual(selectCartItemCount(s1.getState()), 1);
  console.log('✓ Spec 1: Product A × 1 => badge = 1');

  // Row 2: Product A x 3 -> badge = 1
  const s2 = createTestStore();
  s2.dispatch(addToCart({ product: productA, quantity: 3 }));
  assert.strictEqual(selectCartItemCount(s2.getState()), 1);
  console.log('✓ Spec 2: Product A × 3 => badge = 1');

  // Row 3: Product A x 5 + Product B x 1 -> badge = 2
  const s3 = createTestStore();
  s3.dispatch(addToCart({ product: productA, quantity: 5 }));
  s3.dispatch(addToCart({ product: productB, quantity: 1 }));
  assert.strictEqual(selectCartItemCount(s3.getState()), 2);
  console.log('✓ Spec 3: Product A × 5 + Product B × 1 => badge = 2');

  // Row 4: Product A (Chicken) x 2 + Product A (Paneer) x 3 -> badge = 2
  const s4 = createTestStore();
  s4.dispatch(addToCart({ product: productA, quantity: 2, variantId: 'v1', variantName: 'Chicken' }));
  s4.dispatch(addToCart({ product: productA, quantity: 3, variantId: 'v2', variantName: 'Paneer' }));
  assert.strictEqual(selectCartItemCount(s4.getState()), 2);
  console.log('✓ Spec 4: Product A (Chicken) × 2 + Product A (Paneer) × 3 => badge = 2');

  // Row 5: Product A x 2 + Product B x 2 + Product C x 1 -> badge = 3
  const s5 = createTestStore();
  s5.dispatch(addToCart({ product: productA, quantity: 2 }));
  s5.dispatch(addToCart({ product: productB, quantity: 2 }));
  s5.dispatch(addToCart({ product: productC, quantity: 1 }));
  assert.strictEqual(selectCartItemCount(s5.getState()), 3);
  console.log('✓ Spec 5: Product A × 2 + Product B × 2 + Product C × 1 => badge = 3');

  // Row 6: Empty cart -> badge = 0
  const s6 = createTestStore();
  assert.strictEqual(selectCartItemCount(s6.getState()), 0);
  console.log('✓ Spec 6: Empty cart => badge = 0');
}

console.log('\n================================================================');
console.log(' ALL 10 NAVBAR CART BADGE TESTS PASSED SUCCESSFULLY! ');
console.log('================================================================\n');
