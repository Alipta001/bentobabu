import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Product, DietaryType, ProductMediaImage, ProductVideo } from "@/types";
import { categoryService } from "./categoryService";

export interface BackendProduct {
  id?: string;
  _id?: string;
  name: string;
  slug: string;
  description: string;
  category: string | { _id: string; id?: string; name: string; slug: string };
  images?: string[];
  imagesData?: ProductMediaImage[];
  video?: ProductVideo;
  price: number;
  compareAtPrice?: number;
  ingredients?: string[];
  portionSize?: string;
  dietaryTags?: string[];
  mealTypes?: string[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
    fibre?: number;
  };
  allergens?: string[];
  stockQuantity?: number;
  lowStockThreshold?: number;
  isAvailable?: boolean;
  isActive?: boolean;
  isFeatured?: boolean;
  createdAt?: string;
}

export const mapBackendProduct = (p: BackendProduct): Product => {
  const catId =
    typeof p.category === "object" && p.category
      ? (p.category.id || p.category._id || "")
      : (p.category as string) || "";

  let dietary: DietaryType = "vegetarian";
  if (p.dietaryTags?.includes("VEGAN")) {
    dietary = "vegan";
  } else if (p.dietaryTags?.includes("EGG")) {
    dietary = "egg";
  } else if (p.dietaryTags?.includes("NON_VEG")) {
    dietary = "non-vegetarian";
  }

  return {
    id: (p.id || p._id || p.slug) as string,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    originalPrice: p.compareAtPrice,
    categoryIds: catId ? [catId] : [],
    dietary,
    imageUrl: p.images?.[0] || "/images/placeholder.png",
    galleryImages: p.images || [],
    imagesData: p.imagesData || [],
    video: p.video || undefined,
    isAvailable: p.isAvailable ?? true,
    isActive: p.isActive ?? true,
    isBestseller: p.isFeatured ?? false,
    isDailyMenu: p.mealTypes?.includes("DAILY_MENU") ?? false,
    stockQuantity: p.stockQuantity ?? 0,
    lowStockThreshold: p.lowStockThreshold ?? 5,
    sku: `BB-${(p.slug || "DISH").slice(0, 8).toUpperCase()}`,
    servingSize: p.portionSize || "1 portion",
    ingredients: p.ingredients || [],
    allergens: p.allergens || [],
    nutritionalInfo: p.nutrition
      ? {
          calories: p.nutrition.calories ?? 0,
          protein: p.nutrition.protein ?? 0,
          carbs: p.nutrition.carbohydrates ?? 0,
          fats: p.nutrition.fat ?? 0,
          fiber: p.nutrition.fibre ?? 0,
        }
      : undefined,
    createdAt: p.createdAt || new Date().toISOString(),
  };
};

export const productService = {
  async getAll(params?: { categoryId?: string; search?: string }): Promise<Product[]> {
    const queryParams: Record<string, string | number | boolean> = { limit: 100 };
    if (params?.categoryId && params.categoryId !== "all") {
      queryParams.category = params.categoryId;
    }
    if (params?.search && params.search.trim()) {
      queryParams.search = params.search.trim();
    }

    const res = await adminApiClient.get<{
      success: boolean;
      data: BackendProduct[];
    }>(ADMIN_API_ENDPOINTS.PRODUCTS.LIST, { params: queryParams });

    const rawList = Array.isArray(res.data?.data)
      ? res.data.data
      : Array.isArray(res.data)
      ? (res.data as unknown as BackendProduct[])
      : [];

    return rawList.map(mapBackendProduct);
  },

  async getById(id: string): Promise<Product> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: BackendProduct;
    }>(ADMIN_API_ENDPOINTS.PRODUCTS.DETAIL(id));

    return mapBackendProduct(res.data?.data || (res.data as unknown as BackendProduct));
  },

  async create(data: Partial<Product> & { name: string; price: number }): Promise<Product> {
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    let catId = data.categoryIds?.[0] || "";

    if (catId && !catId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const cats = await categoryService.getAll();
        const found = cats.find(
          (c: { slug: string; id: string; name: string }) =>
            c.slug === catId || c.id === catId || c.name.toLowerCase() === catId.toLowerCase()
        );
        if (found) catId = found.id;
      } catch {
        // keep catId
      }
    }

    const payload = {
      name: data.name,
      slug,
      description: data.description || data.name,
      category: catId,
      price: data.price,
      compareAtPrice: data.originalPrice || undefined,
      images: data.imageUrl ? [data.imageUrl, ...(data.galleryImages || [])] : data.galleryImages || [],
      imagesData: data.imagesData,
      video: data.video,
      portionSize: data.servingSize || "1 Bento",
      dietaryTags: data.dietary === "non-vegetarian" ? ["NON_VEG"] : [data.dietary?.toUpperCase() || "VEG"],
      mealTypes: data.isDailyMenu ? ["DAILY_MENU", "LUNCH", "DINNER"] : ["LUNCH", "DINNER"],
      nutrition: {
        calories: data.nutritionalInfo?.calories ?? 0,
        protein: data.nutritionalInfo?.protein ?? 0,
        carbohydrates: data.nutritionalInfo?.carbs ?? 0,
        fat: data.nutritionalInfo?.fats ?? 0,
        fibre: data.nutritionalInfo?.fiber ?? 0,
      },
      allergens: data.allergens || [],
      stockQuantity: data.stockQuantity ?? 10,
      lowStockThreshold: data.lowStockThreshold ?? 5,
      isAvailable: data.isAvailable ?? true,
      isFeatured: data.isBestseller ?? false,
      isActive: true,
    };

    const res = await adminApiClient.post<{
      success: boolean;
      data: BackendProduct;
    }>(ADMIN_API_ENDPOINTS.PRODUCTS.CREATE, payload);

    return mapBackendProduct(res.data?.data || (res.data as unknown as BackendProduct));
  },

  async update(id: string, data: Partial<Product>): Promise<Product> {
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.price !== undefined) payload.price = data.price;
    if (data.originalPrice !== undefined) payload.compareAtPrice = data.originalPrice;
    if (data.categoryIds?.[0]) {
      let cId = data.categoryIds[0];
      if (!cId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const cats = await categoryService.getAll();
          const found = cats.find((c: { slug: string; id: string }) => c.slug === cId || c.id === cId);
          if (found) cId = found.id;
        } catch {
          // fallback
        }
      }
      payload.category = cId;
    }
    if (data.imageUrl || data.galleryImages) {
      payload.images = data.imageUrl ? [data.imageUrl, ...(data.galleryImages || [])] : data.galleryImages;
    }
    if (data.imagesData !== undefined) {
      payload.imagesData = data.imagesData;
    }
    if (data.video !== undefined) {
      payload.video = data.video;
    }
    if (data.servingSize !== undefined) payload.portionSize = data.servingSize;
    if (data.isBestseller !== undefined) payload.isFeatured = data.isBestseller;
    if (data.allergens !== undefined) payload.allergens = data.allergens;
    if (data.nutritionalInfo) {
      payload.nutrition = {
        calories: data.nutritionalInfo.calories ?? 0,
        protein: data.nutritionalInfo.protein ?? 0,
        carbohydrates: data.nutritionalInfo.carbs ?? 0,
        fat: data.nutritionalInfo.fats ?? 0,
        fibre: data.nutritionalInfo.fiber ?? 0,
      };
    }

    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendProduct;
    }>(ADMIN_API_ENDPOINTS.PRODUCTS.UPDATE(id), payload);

    return mapBackendProduct(res.data?.data || (res.data as unknown as BackendProduct));
  },

  async delete(id: string): Promise<void> {
    await adminApiClient.delete(ADMIN_API_ENDPOINTS.PRODUCTS.DELETE(id));
  },

  async toggleAvailability(id: string, isAvailable: boolean): Promise<Product> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendProduct;
    }>(ADMIN_API_ENDPOINTS.PRODUCTS.TOGGLE_AVAILABILITY(id), {
      isAvailable: Boolean(isAvailable),
    });
    return mapBackendProduct(res.data?.data || (res.data as unknown as BackendProduct));
  },

  async toggleStatus(id: string, isActive: boolean): Promise<Product> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendProduct;
    }>(ADMIN_API_ENDPOINTS.PRODUCTS.TOGGLE_STATUS(id), {
      isActive: Boolean(isActive),
    });
    return mapBackendProduct(res.data?.data || (res.data as unknown as BackendProduct));
  },

  async toggleFeatured(id: string, isFeatured?: boolean): Promise<Product> {
    return this.update(id, { isBestseller: isFeatured !== undefined ? isFeatured : true });
  },

  async updateStock(id: string, stockQuantity: number, lowStockThreshold?: number): Promise<Product> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendProduct;
    }>(ADMIN_API_ENDPOINTS.PRODUCTS.UPDATE_STOCK(id), {
      stockQuantity,
      lowStockThreshold,
    });
    return mapBackendProduct(res.data?.data || (res.data as unknown as BackendProduct));
  },
};
