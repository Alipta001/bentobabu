import { Review } from "@/types";
import { INITIAL_REVIEWS } from "@/lib/data/mockStore";

export const reviewService = {
  async getAll(): Promise<Review[]> {
    return this.getStoredReviews();
  },

  async toggleApproval(id: string): Promise<Review> {
    const list = this.getStoredReviews();
    const review = list.find((r) => r.id === id);
    if (!review) throw new Error("Review not found.");
    review.isApproved = !review.isApproved;
    this.saveStoredReviews(list);
    return review;
  },

  getStoredReviews(): Review[] {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("bb_admin_reviews");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // ignore
        }
      }
      localStorage.setItem("bb_admin_reviews", JSON.stringify(INITIAL_REVIEWS));
    }
    return INITIAL_REVIEWS;
  },

  saveStoredReviews(list: Review[]) {
    if (typeof window !== "undefined") {
      localStorage.setItem("bb_admin_reviews", JSON.stringify(list));
    }
  },
};
