import { Product } from "@/types";
import { productService } from "./productService";

export const menuService = {
  async getDailyMenu(): Promise<Product[]> {
    const all = await productService.getAll();
    const daily = all.filter((p) => p.isDailyMenu || p.isBestseller);
    return daily.length > 0 ? daily : all.slice(0, 8);
  },

  async toggleItem(id: string): Promise<Product> {
    const current = await productService.getById(id);
    const updated = await productService.update(id, {
      isDailyMenu: !current.isDailyMenu,
    });
    return updated;
  },
};
