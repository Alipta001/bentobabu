import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { CartItem, Product, Coupon } from "@/types";

interface CartState {
  items: CartItem[];
  appliedCoupon: Coupon | null;
  deliverySlot: string;
  deliveryNotes: string;
}

const CART_STORAGE_KEY = "bb_cart_state_v1";

const loadInitialState = (): CartState => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const validItems = Array.isArray(parsed.items)
          ? parsed.items.filter(
              (it: any) => it && it.product && (it.product.id || it.product._id)
            )
          : [];
        return {
          items: validItems,
          appliedCoupon: parsed.appliedCoupon || null,
          deliverySlot: parsed.deliverySlot || "Immediate (35-45 mins)",
          deliveryNotes: parsed.deliveryNotes || "",
        };
      }
    } catch {
      // Fall through to default
    }
  }
  return {
    items: [],
    appliedCoupon: null,
    deliverySlot: "Immediate (35-45 mins)",
    deliveryNotes: "",
  };
};

const saveState = (state: CartState) => {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }
};

const initialState: CartState = {
  items: [],
  appliedCoupon: null,
  deliverySlot: "Immediate (35-45 mins)",
  deliveryNotes: "",
};

export const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    hydrateCart: (state) => {
      const loaded = loadInitialState();
      state.items = loaded.items;
      state.appliedCoupon = loaded.appliedCoupon;
      state.deliverySlot = loaded.deliverySlot;
      state.deliveryNotes = loaded.deliveryNotes;
    },
    setCartItems: (state, action: PayloadAction<CartItem[]>) => {
      state.items = action.payload;
      saveState(state);
    },
    addToCart: (
      state,
      action: PayloadAction<{
        product: Product;
        quantity?: number;
        variantId?: string | null;
        variantName?: string | null;
        unitPrice?: number;
      }>
    ) => {
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
      saveState(state);
    },
    updateQuantity: (
      state,
      action: PayloadAction<{ productId: string; quantity: number; variantId?: string | null }>
    ) => {
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
      saveState(state);
    },
    removeFromCart: (
      state,
      action: PayloadAction<string | { productId: string; variantId?: string | null }>
    ) => {
      if (typeof action.payload === "string") {
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
      saveState(state);
    },
    applyCoupon: (state, action: PayloadAction<Coupon | null>) => {
      state.appliedCoupon = action.payload;
      saveState(state);
    },
    setDeliveryPreferences: (
      state,
      action: PayloadAction<{ slot?: string; notes?: string }>
    ) => {
      if (action.payload.slot !== undefined) state.deliverySlot = action.payload.slot;
      if (action.payload.notes !== undefined) state.deliveryNotes = action.payload.notes;
      saveState(state);
    },
    clearCart: (state) => {
      state.items = [];
      state.appliedCoupon = null;
      state.deliveryNotes = "";
      saveState(state);
    },
  },
});

export const {
  hydrateCart,
  setCartItems,
  addToCart,
  updateQuantity,
  removeFromCart,
  applyCoupon,
  setDeliveryPreferences,
  clearCart,
} = cartSlice.actions;

export default cartSlice.reducer;

