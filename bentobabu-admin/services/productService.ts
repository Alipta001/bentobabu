import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Product, DietaryType, ProductMediaImage, ProductVideo, ProductVariant } from "@/types";
import { categoryService } from "./categoryService";

export interface BackendProduct {
  id?: string;
  _id?: string;
  name: string;
  slug: string;
  description: string;
  category: string | { _id: string; id?: string; name: string; slug: string };
  categories?: (string | { _id: string; id?: string; name: string; slug: string })[];
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
  preparationTime?: number;
  preparationTimeMinutes?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  isAvailable?: boolean;
  isActive?: boolean;
  isFeatured?: boolean;
  isSignatureItem?: boolean;
  hasVariants?: boolean;
  variantLabel?: string;
  variants?: ProductVariant[];
  createdAt?: string;
}

// Image URL and metadata deduplication helpers
export function getCanonicalImageKey(urlOrObj: string | ProductMediaImage | null | undefined): string {
  if (!urlOrObj) return "";
  if (typeof urlOrObj === "object") {
    if (urlOrObj.publicId && typeof urlOrObj.publicId === "string" && urlOrObj.publicId.trim()) {
      return urlOrObj.publicId.trim();
    }
    if (urlOrObj.secureUrl && typeof urlOrObj.secureUrl === "string") {
      return getCanonicalImageKey(urlOrObj.secureUrl);
    }
    return "";
  }
  if (typeof urlOrObj !== "string") return "";
  const cleanUrl = urlOrObj.split("?")[0].trim();
  const uploadIndex = cleanUrl.indexOf("/upload/");
  if (uploadIndex !== -1) {
    const afterUpload = cleanUrl.substring(uploadIndex + 8);
    const parts = afterUpload.split("/");
    const nonTransformParts = parts.filter(
      (p) => !/^v\d+$/.test(p) && !p.includes(",") && !/^[a-z]_[a-z0-9_]+$/i.test(p)
    );
    if (nonTransformParts.length > 0) {
      return nonTransformParts.join("/").replace(/\.[a-zA-Z0-9]+$/, "");
    }
  }
  return cleanUrl;
}

export function deduplicateUrls(urls: (string | null | undefined)[]): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of urls) {
    if (!item || typeof item !== "string") continue;
    const key = getCanonicalImageKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function deduplicateImagesData(imagesData: ProductMediaImage[]): ProductMediaImage[] {
  if (!Array.isArray(imagesData)) return [];
  const seen = new Set<string>();
  const result: ProductMediaImage[] = [];
  for (const item of imagesData) {
    if (!item) continue;
    const key = getCanonicalImageKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function mapDietaryToTags(dietary?: string): string[] {
  switch (dietary) {
    case "vegan":
      return ["VEGAN"];
    case "egg":
      return ["EGG"];
    case "non-vegetarian":
      return ["NON_VEG"];
    case "vegetarian":
      return ["VEG"];
    default:
      return dietary ? [dietary.toUpperCase()] : ["VEG"];
  }
}

export const mapBackendProduct = (p: BackendProduct): Product => {
  const catId =
    typeof p.category === "object" && p.category
      ? (p.category.id || p.category._id || "")
      : (p.category as string) || "";

  let categoryIds: string[] = [];
  if (Array.isArray(p.categories) && p.categories.length > 0) {
    categoryIds = p.categories
      .map((c) => (typeof c === "object" && c ? c.id || c._id || "" : (c as string) || ""))
      .filter(Boolean);
  } else if (catId) {
    categoryIds = [catId];
  }

  let dietary: DietaryType = "vegetarian";
  const upperTags = (p.dietaryTags || []).map((t) => (typeof t === "string" ? t.toUpperCase().trim() : ""));
  if (upperTags.includes("VEGAN")) {
    dietary = "vegan";
  } else if (upperTags.includes("EGG") || upperTags.includes("CONTAINS_EGG")) {
    dietary = "egg";
  } else if (upperTags.includes("NON_VEG") || upperTags.includes("NON_VEGETARIAN") || upperTags.includes("NON-VEG")) {
    dietary = "non-vegetarian";
  } else if (upperTags.includes("VEG") || upperTags.includes("VEGETARIAN")) {
    dietary = "vegetarian";
  }

    const uniqueImages = deduplicateUrls(p.images || []);
    const uniqueImagesData = deduplicateImagesData(p.imagesData || []);
    const prepTime =
      typeof p.preparationTime === "number"
        ? p.preparationTime
        : typeof p.preparationTimeMinutes === "number"
        ? p.preparationTimeMinutes
        : undefined;

    return {
      id: (p.id || p._id || p.slug) as string,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: p.price,
      originalPrice: p.compareAtPrice,
      categoryIds: categoryIds.length > 0 ? categoryIds : (catId ? [catId] : []),
      dietary,
      imageUrl: uniqueImages[0] || "/images/placeholder.png",
      galleryImages: uniqueImages,
      imagesData: uniqueImagesData,
      video: p.video || undefined,
      isAvailable: p.isAvailable ?? true,
      isActive: p.isActive ?? true,
      isBestseller: p.isFeatured ?? false,
      isSignatureItem: Boolean(p.isSignatureItem),
      isDailyMenu: p.mealTypes?.includes("DAILY_MENU") ?? false,
      stockQuantity: p.stockQuantity ?? 0,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      sku: `BB-${(p.slug || "DISH").slice(0, 8).toUpperCase()}`,
      preparationTime: prepTime,
      preparationTimeMinutes: prepTime,
      servingSize: p.portionSize || "1 portion",
      ingredients: p.ingredients || [],
      allergens: p.allergens || [],
      hasVariants: p.hasVariants ?? false,
      variantLabel: p.variantLabel || "Choose Option",
      variants: Array.isArray(p.variants)
        ? p.variants.map((v) => ({
            _id: v._id || v.id,
            id: v.id || v._id,
            name: v.name,
            price: v.price,
            isAvailable: v.isAvailable ?? true,
            sortOrder: v.sortOrder ?? 1,
          }))
        : [],
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
    const queryParams: Record<string, string | number | boolean> = {
      limit: 100,
      skipCache: "true",
      includeInactive: "true",
    };
    if (params?.categoryId && params.categoryId.toLowerCase() !== "all") {
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
    const rawCategoryIds = Array.isArray(data.categoryIds) ? data.categoryIds : [];
    const resolvedCatIds: string[] = [];

    if (rawCategoryIds.length > 0) {
      let cats: { slug: string; id: string; name: string }[] = [];
      for (let cId of rawCategoryIds) {
        if (cId && !cId.match(/^[0-9a-fA-F]{24}$/)) {
          if (cats.length === 0) {
            try { cats = await categoryService.getAll(); } catch {}
          }
          const found = cats.find(
            (c) => c.slug === cId || c.id === cId || c.name.toLowerCase() === cId.toLowerCase()
          );
          if (found) cId = found.id;
        }
        if (cId && !resolvedCatIds.includes(cId)) {
          resolvedCatIds.push(cId);
        }
      }
    }

    const prepTime = data.preparationTime ?? data.preparationTimeMinutes;
    const rawImages = data.imageUrl ? [data.imageUrl, ...(data.galleryImages || [])] : data.galleryImages || [];

    const cleanDescription = (data.description || data.name || "")
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/gi, "");

    const payload = {
      name: data.name,
      slug,
      description: cleanDescription,
      category: resolvedCatIds[0] || "",
      categories: resolvedCatIds,
      categoryIds: resolvedCatIds,
      price: data.price,
      compareAtPrice: data.originalPrice || undefined,
      images: deduplicateUrls(rawImages),
      imagesData: deduplicateImagesData(data.imagesData || []),
      video: data.video,
      preparationTime: prepTime,
      preparationTimeMinutes: prepTime,
      portionSize: data.servingSize || "1 Bento",
      dietaryTags: mapDietaryToTags(data.dietary),
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
      isSignatureItem: Boolean(data.isSignatureItem),
      isActive: true,
      hasVariants: Boolean(data.hasVariants),
      variantLabel: data.variantLabel || "Choose Option",
      variants: Array.isArray(data.variants)
        ? data.variants.map((v, i) => ({
            name: v.name.trim(),
            price: Number(v.price) || 0,
            isAvailable: v.isAvailable ?? true,
            sortOrder: v.sortOrder ?? i + 1,
            ...(v._id || v.id ? { _id: v._id || v.id } : {}),
          }))
        : [],
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
    if (data.description !== undefined) {
      payload.description = data.description
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/gi, "");
    }
    if (data.price !== undefined) payload.price = data.price;
    if (data.originalPrice !== undefined) payload.compareAtPrice = data.originalPrice;
    if (data.categoryIds !== undefined && Array.isArray(data.categoryIds)) {
      const resolvedCatIds: string[] = [];
      let cats: { slug: string; id: string; name: string }[] = [];
      for (let cId of data.categoryIds) {
        if (cId && !cId.match(/^[0-9a-fA-F]{24}$/)) {
          if (cats.length === 0) {
            try { cats = await categoryService.getAll(); } catch {}
          }
          const found = cats.find(
            (c) => c.slug === cId || c.id === cId || c.name.toLowerCase() === cId.toLowerCase()
          );
          if (found) cId = found.id;
        }
        if (cId && !resolvedCatIds.includes(cId)) {
          resolvedCatIds.push(cId);
        }
      }
      payload.categories = resolvedCatIds;
      payload.categoryIds = resolvedCatIds;
      payload.category = resolvedCatIds[0] || null;
    }
    if (data.imageUrl || data.galleryImages) {
      const rawImages = data.imageUrl ? [data.imageUrl, ...(data.galleryImages || [])] : data.galleryImages || [];
      payload.images = deduplicateUrls(rawImages);
    }
    if (data.imagesData !== undefined) {
      payload.imagesData = deduplicateImagesData(data.imagesData);
    }
    const prepTime = data.preparationTime ?? data.preparationTimeMinutes;
    if (prepTime !== undefined) {
      payload.preparationTime = prepTime;
      payload.preparationTimeMinutes = prepTime;
    }
    if (data.video !== undefined) {
      payload.video = data.video;
    }
    if (data.servingSize !== undefined) payload.portionSize = data.servingSize;
    if (data.isBestseller !== undefined) payload.isFeatured = data.isBestseller;
    if (data.isSignatureItem !== undefined) payload.isSignatureItem = Boolean(data.isSignatureItem);
    if (data.dietary !== undefined) {
      payload.dietary = data.dietary;
      payload.dietaryTags = mapDietaryToTags(data.dietary);
    }
    if (data.allergens !== undefined) payload.allergens = data.allergens;
    if (data.hasVariants !== undefined) payload.hasVariants = Boolean(data.hasVariants);
    if (data.variantLabel !== undefined) payload.variantLabel = data.variantLabel;
    if (data.variants !== undefined) {
      payload.variants = Array.isArray(data.variants)
        ? data.variants.map((v, i) => ({
            name: v.name.trim(),
            price: Number(v.price) || 0,
            isAvailable: v.isAvailable ?? true,
            sortOrder: v.sortOrder ?? i + 1,
            ...(v._id || v.id ? { _id: v._id || v.id } : {}),
          }))
        : [];
    }
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
