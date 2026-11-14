import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Category } from "@/types";

export interface BackendCategory {
  id?: string;
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  displayOrder?: number;
  isActive: boolean;
  itemCount?: number;
}

const mapCategory = (c: BackendCategory): Category => ({
  id: (c.id || c._id || c.slug) as string,
  name: c.name,
  slug: c.slug,
  description: c.description || "",
  tagline: "",
  image: c.image || "/images/placeholder.png",
  isActive: c.isActive ?? true,
  itemCount: c.itemCount ?? 0,
});

export const categoryService = {
  async getAll(): Promise<Category[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: BackendCategory[];
    }>(ADMIN_API_ENDPOINTS.CATEGORIES.LIST);

    const list = Array.isArray(res.data?.data)
      ? res.data.data
      : Array.isArray(res.data)
      ? (res.data as unknown as BackendCategory[])
      : [];

    return list.map(mapCategory);
  },

  async create(data: {
    name: string;
    slug?: string;
    description?: string;
    image?: string;
    displayOrder?: number;
    isActive?: boolean;
  }): Promise<Category> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: BackendCategory;
    }>(ADMIN_API_ENDPOINTS.CATEGORIES.CREATE, data);

    return mapCategory(res.data?.data || (res.data as unknown as BackendCategory));
  },

  async update(id: string, data: Partial<BackendCategory>): Promise<Category> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendCategory;
    }>(ADMIN_API_ENDPOINTS.CATEGORIES.UPDATE(id), data);

    return mapCategory(res.data?.data || (res.data as unknown as BackendCategory));
  },

  async toggleStatus(id: string, isActive: boolean): Promise<Category> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendCategory;
    }>(ADMIN_API_ENDPOINTS.CATEGORIES.TOGGLE_STATUS(id), { isActive });

    return mapCategory(res.data?.data || (res.data as unknown as BackendCategory));
  },
};
