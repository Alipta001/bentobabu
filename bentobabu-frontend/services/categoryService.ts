import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Category } from "@/types";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

const normalizeCategory = (cat: any): Category => {
  return {
    id: cat.id || cat._id || "",
    _id: cat._id || cat.id || "",
    name: cat.name || "",
    slug: cat.slug || "",
    description: cat.description || "",
    tagline: cat.tagline || cat.description || "",
    image: cat.image || "",
    isActive: cat.isActive !== false,
    featured: cat.featured ?? true,
    itemCount: cat.itemCount,
  };
};

export const categoryService = {
  async getAll(): Promise<Category[]> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ categories: any[] }> | { categories: any[] } | Category[]
      >(API_ENDPOINTS.CATEGORIES.LIST);

      const raw = response.data;
      let list: any[] = [];

      if (raw && typeof raw === "object" && "data" in raw) {
        if (Array.isArray(raw.data)) {
          list = raw.data;
        } else if (raw.data && typeof raw.data === "object" && Array.isArray((raw.data as any).categories)) {
          list = (raw.data as any).categories;
        }
      } else if (raw && typeof raw === "object" && "categories" in raw && Array.isArray((raw as any).categories)) {
        list = (raw as any).categories;
      } else if (Array.isArray(raw)) {
        list = raw;
      }

      return list.map(normalizeCategory);
    } catch (err) {
      console.error("[categoryService] Error fetching categories:", err);
      throw err;
    }
  },

  async getBySlug(slug: string): Promise<Category | null> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ category: any }> | { category: any } | Category
      >(API_ENDPOINTS.CATEGORIES.DETAIL(slug));

      const raw = response.data;
      let item: any = null;

      if (raw && typeof raw === "object" && "data" in raw) {
        item = (raw.data as any)?.category || raw.data;
      } else if (raw && typeof raw === "object" && "category" in raw) {
        item = (raw as any).category;
      } else {
        item = raw;
      }

      return item ? normalizeCategory(item) : null;
    } catch (err) {
      console.error(`[categoryService] Error fetching category by slug (${slug}):`, err);
      return null;
    }
  },
};
