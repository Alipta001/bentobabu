import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Product, ProductFilterOptions, DietaryType } from "@/types";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

const mapDietary = (tags: string[] = []): DietaryType => {
  if (tags.includes("VEGAN")) return "vegan";
  if (tags.includes("VEG")) return "vegetarian";
  if (tags.includes("NON_VEG")) return "non-vegetarian";
  return "vegetarian";
};

export const normalizeProduct = (item: any): Product => {
  const images = Array.isArray(item.images) && item.images.length > 0
    ? item.images
    : item.imageUrl
    ? [item.imageUrl]
    : ["https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"];

  const dietary = item.dietary || mapDietary(item.dietaryTags);
  const rawNutrition = item.nutrition || item.nutritionalInfo || {};
  const nutrition = {
    calories: typeof rawNutrition.calories === "number" ? rawNutrition.calories : 450,
    protein: typeof rawNutrition.protein === "number" ? rawNutrition.protein : 25,
    carbs: typeof rawNutrition.carbohydrates === "number" ? rawNutrition.carbohydrates : (typeof rawNutrition.carbs === "number" ? rawNutrition.carbs : 45),
    carbohydrates: typeof rawNutrition.carbohydrates === "number" ? rawNutrition.carbohydrates : (typeof rawNutrition.carbs === "number" ? rawNutrition.carbs : 45),
    fats: typeof rawNutrition.fat === "number" ? rawNutrition.fat : (typeof rawNutrition.fats === "number" ? rawNutrition.fats : 12),
    fat: typeof rawNutrition.fat === "number" ? rawNutrition.fat : (typeof rawNutrition.fats === "number" ? rawNutrition.fats : 12),
    fiber: typeof rawNutrition.fibre === "number" ? rawNutrition.fibre : (typeof rawNutrition.fiber === "number" ? rawNutrition.fiber : 6),
    fibre: typeof rawNutrition.fibre === "number" ? rawNutrition.fibre : (typeof rawNutrition.fiber === "number" ? rawNutrition.fiber : 6),
  };

  const categoryId = item.category?._id || item.category?.id || item.category || "";
  const categoryIds = Array.isArray(item.categoryIds)
    ? item.categoryIds
    : categoryId
    ? [categoryId]
    : [];

  return {
    id: item.id || item._id || "",
    _id: item._id || item.id || "",
    slug: item.slug || "",
    name: item.name || "",
    description: item.description || "",
    detailedDescription: item.detailedDescription || item.description || "",
    price: typeof item.price === "number" ? item.price : 0,
    originalPrice: item.originalPrice || item.price,
    discountPrice: item.discountPrice,
    category: item.category,
    categoryIds,
    dietary,
    dietaryTags: item.dietaryTags || [],
    mealTypes: item.mealTypes || [],
    imageUrl: images[0],
    images,
    galleryImages: images,
    isAvailable: item.isAvailable !== false,
    isBestseller: item.isBestseller ?? item.isFeatured ?? false,
    isFeatured: item.isFeatured ?? false,
    isChefSpecial: item.isChefSpecial ?? false,
    preparationTime: item.preparationTime || item.preparationTimeMinutes || 20,
    preparationTimeMinutes: item.preparationTimeMinutes || item.preparationTime || 20,
    stockQuantity: typeof item.stockQuantity === "number" ? item.stockQuantity : 50,
    servingSize: item.servingSize || "1 Bento Box (400g)",
    nutrition,
    nutritionalInfo: nutrition,
    ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
    allergens: Array.isArray(item.allergens) ? item.allergens : [],
    tags: Array.isArray(item.tags) ? item.tags : item.dietaryTags || [],
  };
};

export const productService = {
  async getAll(filters?: ProductFilterOptions, signal?: AbortSignal): Promise<Product[]> {
    try {
      const params: Record<string, unknown> = {};

      if (filters?.search && filters.search.trim()) {
        params.search = filters.search.trim();
      }

      if (filters?.categoryId || filters?.category) {
        params.category = filters.categoryId || filters.category;
      }

      if (filters?.dietary && filters.dietary.length > 0) {
        const dietaryMap: Record<string, string> = {
          vegetarian: "VEG",
          "non-vegetarian": "NON_VEG",
          vegan: "VEGAN",
        };
        const mapped = filters.dietary
          .map((d) => dietaryMap[d] || d)
          .join(",");
        params.dietaryTags = mapped;
      } else if (filters?.dietaryTags) {
        params.dietaryTags = filters.dietaryTags;
      }

      if (filters?.mealTypes) {
        params.mealTypes = filters.mealTypes;
      }

      if (typeof filters?.maxPrice === "number" && filters.maxPrice < 1000) {
        params.maxPrice = filters.maxPrice;
      }
      if (typeof filters?.minPrice === "number" && filters.minPrice > 0) {
        params.minPrice = filters.minPrice;
      }

      if (filters?.sortBy) {
        const sortMap: Record<string, string> = {
          "price-asc": "price_low_to_high",
          "price-desc": "price_high_to_low",
          newest: "newest",
          popularity: "popularity",
        };
        params.sortBy = sortMap[filters.sortBy] || filters.sortBy;
      }

      if (filters?.page) params.page = filters.page;
      if (filters?.limit) params.limit = filters.limit;

      const response = await apiClient.get<
        ApiResponse<{ products: any[]; pagination?: any }> | { products: any[] } | any[]
      >(API_ENDPOINTS.PRODUCTS.LIST, { params, signal });

      const raw = response.data;
      let list: any[] = [];

      if (raw && typeof raw === "object" && "data" in raw) {
        if (Array.isArray(raw.data)) {
          list = raw.data;
        } else if (raw.data && typeof raw.data === "object" && Array.isArray((raw.data as any).products)) {
          list = (raw.data as any).products;
        }
      } else if (raw && typeof raw === "object" && "products" in raw && Array.isArray((raw as any).products)) {
        list = (raw as any).products;
      } else if (Array.isArray(raw)) {
        list = raw;
      }

      return list.map(normalizeProduct);
    } catch (err) {
      console.error("[productService] Error fetching products:", err);
      throw err;
    }
  },

  async getBySlug(slug: string): Promise<Product | null> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ product: any }> | { product: any } | any
      >(API_ENDPOINTS.PRODUCTS.DETAIL(slug));

      const raw = response.data;
      let item: any = null;

      if (raw && typeof raw === "object" && "data" in raw) {
        item = (raw.data as any)?.product || raw.data;
      } else if (raw && typeof raw === "object" && "product" in raw) {
        item = (raw as any).product;
      } else {
        item = raw;
      }

      return item ? normalizeProduct(item) : null;
    } catch (err) {
      console.error(`[productService] Error fetching product by slug (${slug}):`, err);
      return null;
    }
  },

  async getBestsellers(): Promise<Product[]> {
    return this.getAll({ limit: 4 });
  },

  async getRelated(productId: string): Promise<Product[]> {
    try {
      const all = await this.getAll({ limit: 6 });
      return all.filter((p) => p.id !== productId).slice(0, 4);
    } catch {
      return [];
    }
  },
};
