"use client";

import { useEffect, useCallback, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setCartItems,
  addToCart as localAddToCart,
  updateQuantity as localUpdateQuantity,
  removeFromCart as localRemoveFromCart,
  clearCart as localClearCart,
} from "@/store/cartSlice";
import { cartService } from "@/services/cartService";
import { useUserProfile } from "./useQueries";
import { Product } from "@/types";

export function useCartSync() {
  const dispatch = useAppDispatch();
  const { data: user } = useUserProfile();
  const cartItems = useAppSelector((state) => state.cart.items);
  const appliedCoupon = useAppSelector((state) => state.cart.appliedCoupon);
  const lastSyncedUserRef = useRef<string | null>(null);

  // Sync / merge cart with backend when user logs in or mounts authenticated
  useEffect(() => {
    let isCancelled = false;
    const userId = user?.id || (user as any)?._id;

    if (userId) {
      if (lastSyncedUserRef.current !== userId) {
        lastSyncedUserRef.current = userId;

        const currentLocal = cartItems;
        const syncPromise = currentLocal.length > 0
          ? cartService.mergeCart(currentLocal)
          : cartService.getCart();

        syncPromise
          .then(({ items }) => {
            if (!isCancelled && Array.isArray(items)) {
              dispatch(setCartItems(items));
            }
          })
          .catch((err) => {
            console.error("[useCartSync] Initial sync failed:", err);
          });
      }
    } else {
      lastSyncedUserRef.current = null;
    }

    return () => {
      isCancelled = true;
    };
  }, [user, dispatch]);

  const addItem = useCallback(
    async (
      product: Product,
      quantity = 1,
      variantId?: string | null,
      variantName?: string | null,
      unitPrice?: number
    ) => {
      // Optimistic update
      dispatch(
        localAddToCart({
          product,
          quantity,
          variantId: variantId || null,
          variantName: variantName || null,
          unitPrice,
        })
      );
      if (user) {
        try {
          await cartService.addItem(product.id, quantity, variantId);
        } catch (err) {
          console.error("Failed to sync add item to server cart:", err);
        }
      }
    },
    [dispatch, user]
  );

  const setQuantity = useCallback(
    async (productId: string, quantity: number, variantId?: string | null) => {
      // Optimistic update
      dispatch(localUpdateQuantity({ productId, quantity, variantId }));
      if (user) {
        try {
          if (quantity <= 0) {
            await cartService.removeItem(productId, variantId);
          } else {
            await cartService.updateQuantity(productId, quantity, variantId);
          }
        } catch (err) {
          console.error("Failed to sync quantity update to server cart:", err);
        }
      }
    },
    [dispatch, user]
  );

  const removeItem = useCallback(
    async (productId: string, variantId?: string | null) => {
      // Optimistic update
      dispatch(localRemoveFromCart({ productId, variantId }));
      if (user) {
        try {
          await cartService.removeItem(productId, variantId);
        } catch (err) {
          console.error("Failed to sync item removal to server cart:", err);
        }
      }
    },
    [dispatch, user]
  );

  const clear = useCallback(async () => {
    dispatch(localClearCart());
    if (user) {
      try {
        await cartService.clearCart();
      } catch (err) {
        console.error("Failed to clear server cart:", err);
      }
    }
  }, [dispatch, user]);

  return {
    cartItems,
    appliedCoupon,
    addItem,
    setQuantity,
    removeItem,
    clear,
  };
}

