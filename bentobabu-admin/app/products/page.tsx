"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Flame,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminProducts,
  useAdminCategories,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useToggleProductAvailability,
  useToggleProductStatus,
} from "@/hooks/useAdminQueries";
import { Product, DietaryType, ProductVariant } from "@/types";
import { MediaImageUpload } from "@/components/media/MediaImageUpload";
import { MediaVideoUpload } from "@/components/media/MediaVideoUpload";
import { StorageUsageCard } from "@/components/media/StorageUsageCard";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

function ProductsContent() {
  const searchParams = useSearchParams();
  const autoNew = searchParams.get("action") === "new";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [modalOpen, setModalOpen] = useState(autoNew);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [formData, setFormData] = useState<Omit<Product, "id" | "createdAt">>({
    slug: "",
    name: "",
    description: "",
    detailedDescription: "",
    price: 299,
    originalPrice: 349,
    costPrice: 120,
    categoryIds: [],
    dietary: "vegetarian",
    imageUrl:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    imagesData: [],
    video: undefined,
    isAvailable: true,
    isBestseller: false,
    isSignatureItem: false,
    isDailyMenu: true,
    stockQuantity: 25,
    lowStockThreshold: 8,
    sku: "BB-NEW-01",
    preparationTime: 15,
    preparationTimeMinutes: 15,
    servingSize: "380g",
    nutritionalInfo: { calories: 420, protein: 30, carbs: 45, fats: 10, fiber: 8 },
    ingredients: ["Fresh seasonal produce", "Cold-pressed oil", "Whole spices"],
    allergens: ["None"],
    hasVariants: false,
    variantLabel: "Choose Option",
    variants: [],
  });

  const { data: products = [], isLoading } = useAdminProducts({
    categoryId: selectedCategory,
    search: searchQuery,
  });

  const { data: categories = [] } = useAdminCategories();
  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  const toggleAvailabilityMutation = useToggleProductAvailability();
  const toggleStatusMutation = useToggleProductStatus();
  const isSaving = createProductMutation.isPending || updateProductMutation.isPending;

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormData({
      slug: `meal-${Date.now()}`,
      name: "",
      description: "",
      detailedDescription: "",
      price: 299,
      originalPrice: 349,
      costPrice: 120,
      categoryIds: categories[0]?.id ? [categories[0].id] : [],
      dietary: "vegetarian",
      imageUrl:
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
      imagesData: [],
      video: undefined,
      isAvailable: true,
      isBestseller: false,
      isSignatureItem: false,
      isDailyMenu: true,
      stockQuantity: 25,
      lowStockThreshold: 8,
      sku: `BB-${Math.floor(100 + Math.random() * 900)}`,
      preparationTime: 15,
      preparationTimeMinutes: 15,
      servingSize: "380g",
      nutritionalInfo: { calories: 400, protein: 25, carbs: 45, fats: 10, fiber: 8 },
      ingredients: ["Fresh produce"],
      allergens: ["None"],
      hasVariants: false,
      variantLabel: "Choose Option",
      variants: [],
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    const initialCategoryIds = Array.isArray(p.categoryIds) && p.categoryIds.length > 0
      ? p.categoryIds
      : p.category
      ? [typeof p.category === "object" ? p.category.id || p.category._id || "" : (p.category as string)]
      : [];

    setFormData({
      slug: p.slug,
      name: p.name,
      description: p.description,
      detailedDescription: p.detailedDescription || "",
      price: p.price,
      originalPrice: p.originalPrice || p.price,
      costPrice: p.costPrice || Math.round(p.price * 0.45),
      categoryIds: initialCategoryIds.filter(Boolean),
      dietary: p.dietary,
      imageUrl: p.imageUrl,
      imagesData: p.imagesData || [],
      video: p.video || undefined,
      isAvailable: p.isAvailable,
      isBestseller: p.isBestseller || false,
      isSignatureItem: p.isSignatureItem || false,
      isDailyMenu: p.isDailyMenu ?? true,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      sku: p.sku,
      preparationTime: p.preparationTime ?? p.preparationTimeMinutes ?? 15,
      preparationTimeMinutes: p.preparationTimeMinutes ?? p.preparationTime ?? 15,
      servingSize: p.servingSize || "350g",
      nutritionalInfo: p.nutritionalInfo || {
        calories: 350,
        protein: 20,
        carbs: 40,
        fats: 8,
      },
      ingredients: p.ingredients || [],
      allergens: p.allergens || [],
      hasVariants: p.hasVariants || false,
      variantLabel: p.variantLabel || "Choose Option",
      variants: p.variants || [],
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}" from the catalogue?`)) {
      try {
        await deleteProductMutation.mutateAsync(id);
        toast.success(`"${name}" removed from catalogue.`);
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || "Failed to delete product";
        toast.error(`Delete failed: ${msg}`);
      }
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Product name is required.");
      return;
    }
    if (!formData.categoryIds || formData.categoryIds.length === 0) {
      toast.error("Please assign at least one category to this product.");
      return;
    }
    if (formData.hasVariants) {
      if (!formData.variants || formData.variants.length === 0) {
        toast.error("Please add at least one variant option for this product.");
        return;
      }
      const names = new Set<string>();
      for (let i = 0; i < formData.variants.length; i++) {
        const v = formData.variants[i];
        if (!v.name.trim()) {
          toast.error(`Variant option #${i + 1} must have a non-empty name.`);
          return;
        }
        const canonical = v.name.trim().toLowerCase();
        if (names.has(canonical)) {
          toast.error(`Duplicate variant name "${v.name}" is not allowed.`);
          return;
        }
        names.add(canonical);
        if (typeof v.price !== "number" || isNaN(v.price) || v.price < 0) {
          toast.error(`Variant "${v.name}" must have a valid non-negative price.`);
          return;
        }
      }
    }
    if (isSaving) return;

    try {
      if (editingProduct) {
        await updateProductMutation.mutateAsync({
          id: editingProduct.id,
          data: formData,
        });
        toast.success(`"${formData.name}" updated successfully!`);
      } else {
        await createProductMutation.mutateAsync(formData);
        toast.success(`"${formData.name}" published to menu successfully!`);
      }
      setModalOpen(false);
    } catch (err: any) {
      console.error("[ProductSaveError]", err);
      const apiMessage =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to save product. Please try again.";
      toast.error(`Could not publish product: ${apiMessage}`);
    }
  };

  return (
    <AdminShell
      title="Product Catalogue Management"
      subtitle="Create, edit, price and manage nutritional dishes across targeted collections"
    >
      {/* Storage & Quota Monitoring */}
      <StorageUsageCard />

      {/* Controls Bar */}
      <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 max-w-md">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Search dishes by name, SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
            <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3.5 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] focus:outline-none focus:border-[#354B35]"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#B99A60]" />
          <span>Add New Healthy Dish</span>
        </button>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#667266]">
            Loading catalogue...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                  <th className="py-3.5 px-6 font-bold">Dish & Thumbnail</th>
                  <th className="py-3.5 px-4 font-bold">Dietary</th>
                  <th className="py-3.5 px-4 font-bold">Price / Cost</th>
                  <th className="py-3.5 px-4 font-bold">Stock</th>
                  <th className="py-3.5 px-4 font-bold">Macros (P/C/F)</th>
                  <th className="py-3.5 px-4 font-bold">Availability</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE1]">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F9F7F1] transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover border border-[#E5DFC5]"
                        />
                        <div>
                          <div className="font-bold text-[#1F271F] flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            {p.isBestseller && (
                              <Flame className="w-3.5 h-3.5 text-[#B99A60]" />
                            )}
                            {p.isSignatureItem && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DFC89B]/35 text-[#755C2B] border border-[#B99A60]/40">
                                <Sparkles className="w-2.5 h-2.5" />
                                Signature
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#667266]">
                            SKU: {p.sku} • {p.servingSize || "1 portion"}
                            {Boolean(p.preparationTimeMinutes || p.preparationTime) && (
                              <span> • {p.preparationTimeMinutes || p.preparationTime}m prep</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F7F3EA] border border-[#E5DFC5] text-[#354B35]">
                        {p.dietary}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0 ? (
                        <div>
                          <div className="font-bold text-[#1F271F]">
                            {(() => {
                              const prices = p.variants.map((v) => v.price);
                              const min = Math.min(...prices);
                              const max = Math.max(...prices);
                              return min === max ? `₹${min}` : `₹${min} - ₹${max}`;
                            })()}
                          </div>
                          <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            {p.variants.length} options
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="font-bold text-[#1F271F]">₹{p.price}</div>
                          {p.costPrice && (
                            <div className="text-[10px] text-[#8A9A86]">
                              Cost: ₹{p.costPrice}
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`font-semibold ${
                          p.stockQuantity <= p.lowStockThreshold
                            ? "text-red-700 font-bold"
                            : "text-[#1F271F]"
                        }`}
                      >
                        {p.stockQuantity} units
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-[#667266]">
                      {p.nutritionalInfo ? (
                        <span>
                          {p.nutritionalInfo.protein}g / {p.nutritionalInfo.carbs}g /{" "}
                          {p.nutritionalInfo.fats}g
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <button
                        onClick={() =>
                          toggleAvailabilityMutation.mutate({
                            id: p.id,
                            isAvailable: !p.isAvailable,
                          })
                        }
                        className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                          p.isAvailable
                            ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                            : "bg-amber-100 text-amber-900 hover:bg-amber-200"
                        }`}
                        title="Toggle customer ordering availability"
                      >
                        {p.isAvailable ? "Available" : "Unavailable"}
                      </button>
                    </td>

                    <td className="py-3.5 px-4">
                      <button
                        onClick={() =>
                          toggleStatusMutation.mutate({
                            id: p.id,
                            isActive: p.isActive === false ? true : false,
                          })
                        }
                        className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                          p.isActive !== false
                            ? "bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100"
                            : "bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-200"
                        }`}
                        title="Activate or Deactivate product in master catalog without deleting"
                      >
                        {p.isActive !== false ? "Active" : "Inactive"}
                      </button>
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 rounded-lg text-[#667266] hover:text-[#354B35] hover:bg-black/5 cursor-pointer"
                          title="Edit product"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="p-1.5 rounded-lg text-[#667266] hover:text-red-700 hover:bg-red-50 cursor-pointer"
                          title="Delete product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setModalOpen(false)}
          />

          <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl border border-[#E5DFC5]">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
              <h3 className="font-serif text-2xl font-bold text-[#1F271F]">
                {editingProduct ? "Edit Healthy Dish" : "Create New Healthy Dish"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl text-[#667266] hover:text-[#1F271F]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Dish Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g. Steamed Millet Idlis with Sambar"
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">SKU Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) =>
                      setFormData({ ...formData, sku: e.target.value })
                    }
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#1F271F]">
                    Product Description (Rich Text) *
                  </label>
                  <span className="text-[11px] text-[#8A9A86]">
                    Format headings, bullet lists, bold/italics, and highlight key ingredients
                  </span>
                </div>
                <RichTextEditor
                  value={formData.description}
                  onChange={(html) =>
                    setFormData({ ...formData, description: html })
                  }
                  placeholder="Describe the meal: highlight heritage ingredients, cooking style, taste notes, and meal pairing..."
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Selling Price (₹) *</label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: Number(e.target.value) })
                    }
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Original Price (₹)</label>
                  <input
                    type="number"
                    value={formData.originalPrice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        originalPrice: Number(e.target.value),
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Dietary Type</label>
                  <select
                    value={formData.dietary}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        dietary: e.target.value as DietaryType,
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  >
                    <option value="vegetarian">Vegetarian</option>
                    <option value="non-vegetarian">Non-Vegetarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="egg">Egg</option>
                  </select>
                </div>

                {/* Product Variants / Customisations Section */}
                <div className="col-span-3 p-4 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#1F271F] flex items-center gap-2">
                        <span>Product Variants / Customisations</span>
                        {formData.hasVariants && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#354B35] text-white">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#667266]">
                        Does this food item have different variants with distinct prices? (e.g. Chicken ₹199, Paneer ₹179, Soyabean ₹149)
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.hasVariants || false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const initialVariants =
                            checked && (!formData.variants || formData.variants.length === 0)
                              ? [
                                  {
                                    name: "Option 1",
                                    price: formData.price,
                                    isAvailable: true,
                                    sortOrder: 1,
                                  },
                                ]
                              : formData.variants || [];
                          setFormData({
                            ...formData,
                            hasVariants: checked,
                            variants: initialVariants,
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#354B35]"></div>
                    </label>
                  </div>

                  {formData.hasVariants && (
                    <div className="space-y-3 pt-2 border-t border-[#E5DFC5]">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#1F271F]">
                          Selection Prompt / Label *
                        </label>
                        <input
                          type="text"
                          value={formData.variantLabel || "Choose Option"}
                          onChange={(e) =>
                            setFormData({ ...formData, variantLabel: e.target.value })
                          }
                          placeholder="e.g. Choose Protein, Select Base, Choose Size"
                          className="w-full p-2 text-xs rounded-xl bg-white border border-[#E5DFC5]"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#1F271F]">
                            Option List ({formData.variants?.length || 0})
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const current = formData.variants || [];
                              const nextOrder = current.length + 1;
                              setFormData({
                                ...formData,
                                variants: [
                                  ...current,
                                  {
                                    name: "",
                                    price: formData.price,
                                    isAvailable: true,
                                    sortOrder: nextOrder,
                                  },
                                ],
                              });
                            }}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#354B35] text-white hover:bg-[#253525] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Option</span>
                          </button>
                        </div>

                        {(!formData.variants || formData.variants.length === 0) ? (
                          <div className="p-3 text-xs text-center text-[#8A9A86] border border-dashed border-[#D5CDBE] rounded-xl bg-white">
                            No options added yet. Click &ldquo;Add Option&rdquo; above.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {formData.variants.map((v, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 bg-white rounded-xl border border-[#E5DFC5] flex items-center gap-2.5"
                              >
                                <div className="flex-1">
                                  <label className="text-[10px] text-[#8A9A86] font-semibold block">
                                    Variant Name *
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={v.name}
                                    placeholder="e.g. Chicken, Paneer, Soyabean"
                                    onChange={(e) => {
                                      const updated = [...(formData.variants || [])];
                                      updated[idx] = { ...updated[idx], name: e.target.value };
                                      setFormData({ ...formData, variants: updated });
                                    }}
                                    className="w-full p-1.5 text-xs rounded-lg border border-[#E5DFC5] bg-[#F7F3EA]"
                                  />
                                </div>

                                <div className="w-28">
                                  <label className="text-[10px] text-[#8A9A86] font-semibold block">
                                    Price (₹) *
                                  </label>
                                  <input
                                    type="number"
                                    required
                                    min={0}
                                    value={v.price}
                                    onChange={(e) => {
                                      const updated = [...(formData.variants || [])];
                                      updated[idx] = {
                                        ...updated[idx],
                                        price: Number(e.target.value),
                                      };
                                      setFormData({ ...formData, variants: updated });
                                    }}
                                    className="w-full p-1.5 text-xs rounded-lg border border-[#E5DFC5] bg-[#F7F3EA]"
                                  />
                                </div>

                                <div className="flex flex-col items-center">
                                  <label className="text-[10px] text-[#8A9A86] font-semibold block">
                                    Available
                                  </label>
                                  <input
                                    type="checkbox"
                                    checked={v.isAvailable !== false}
                                    onChange={(e) => {
                                      const updated = [...(formData.variants || [])];
                                      updated[idx] = {
                                        ...updated[idx],
                                        isAvailable: e.target.checked,
                                      };
                                      setFormData({ ...formData, variants: updated });
                                    }}
                                    className="mt-1 h-4 w-4 rounded text-[#354B35] cursor-pointer"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (formData.variants || []).filter(
                                      (_, i) => i !== idx
                                    );
                                    setFormData({ ...formData, variants: updated });
                                  }}
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer mt-3"
                                  title="Remove option"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 col-span-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-[#1F271F]">
                      Assigned Collections / Categories * ({formData.categoryIds.length})
                    </label>
                    <span className="text-[11px] text-[#8A9A86]">Select all applicable categories</span>
                  </div>

                  {/* Selected Categories Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] p-2 bg-[#F7F3EA] rounded-xl border border-[#E5DFC5]">
                    {formData.categoryIds.length === 0 ? (
                      <span className="text-xs text-[#8A9A86] italic px-1">
                        No categories assigned yet. Use the dropdown below to select one or more categories.
                      </span>
                    ) : (
                      formData.categoryIds.map((cid) => {
                        const cat = categories.find((c) => c.id === cid || c.slug === cid);
                        return (
                          <span
                            key={cid}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#354B35] text-white shadow-xs"
                          >
                            <span>{cat?.name || cid}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  categoryIds: formData.categoryIds.filter((id) => id !== cid),
                                });
                              }}
                              className="text-[#DFC89B] hover:text-white transition-colors cursor-pointer"
                              title={`Remove ${cat?.name || cid}`}
                              aria-label={`Remove category ${cat?.name || cid}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>

                  {/* Category Selector Dropdown */}
                  <select
                    value=""
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (selectedId && !formData.categoryIds.includes(selectedId)) {
                        setFormData({
                          ...formData,
                          categoryIds: [...formData.categoryIds, selectedId],
                        });
                      }
                    }}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#E5DFC5] text-xs font-medium text-[#1F271F] focus:outline-none focus:border-[#354B35]"
                  >
                    <option value="">+ Add a Category / Collection...</option>
                    {categories
                      .filter((c) => !formData.categoryIds.includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Signature Item Toggle */}
              <div className="p-4 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5] flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="font-bold text-[#1F271F] flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
                    <span>Signature Item</span>
                    {formData.isSignatureItem && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#354B35] text-white">
                        Featured
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#667266]">
                    Feature this product in the Signature Items section on the customer website.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.isSignatureItem || false}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isSignatureItem: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                    aria-label="Signature Item"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#354B35]"></div>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Stock Count</label>
                  <input
                    type="number"
                    value={formData.stockQuantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stockQuantity: Number(e.target.value),
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Min Stock Threshold</label>
                  <input
                    type="number"
                    value={formData.lowStockThreshold}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lowStockThreshold: Number(e.target.value),
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Serving Size</label>
                  <input
                    type="text"
                    value={formData.servingSize}
                    onChange={(e) =>
                      setFormData({ ...formData, servingSize: e.target.value })
                    }
                    placeholder="e.g. 400g"
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1F271F]">Prep Time (min)</label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={formData.preparationTimeMinutes ?? formData.preparationTime ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      setFormData({
                        ...formData,
                        preparationTime: val,
                        preparationTimeMinutes: val,
                      });
                    }}
                    placeholder="e.g. 20"
                    className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                  />
                </div>
              </div>

              {/* Media Management (Cloudinary WebP Images & Cloudflare R2 Videos) */}
              <div className="space-y-4 p-4 bg-[#F7F3EA] rounded-2xl border border-[#E5DFC5]">
                <MediaImageUpload
                  folder="bentobabu/products"
                  productId={editingProduct?.id}
                  initialImages={formData.imagesData}
                  initialImageUrl={formData.imageUrl}
                  maxFiles={4}
                  onChange={(imgs, primaryUrl) => {
                    setFormData((prev) => ({
                      ...prev,
                      imagesData: imgs,
                      imageUrl: primaryUrl || prev.imageUrl,
                      galleryImages: imgs.map((i) => i.secureUrl),
                    }));
                  }}
                />

                <MediaVideoUpload
                  productId={editingProduct?.id}
                  initialVideo={formData.video}
                  posterUrl={formData.imageUrl}
                  onChange={(vid) => {
                    setFormData((prev) => ({
                      ...prev,
                      video: vid || undefined,
                    }));
                  }}
                />
              </div>

              {/* Macro Inputs */}
              <div className="p-3 bg-[#F7F3EA] rounded-2xl border border-[#E5DFC5] space-y-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-[#354B35]">
                  Calibrated Nutrition Macros
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-[#667266]">Calories (kcal)</label>
                    <input
                      type="number"
                      value={formData.nutritionalInfo?.calories}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          nutritionalInfo: {
                            ...formData.nutritionalInfo!,
                            calories: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full p-2 rounded-lg bg-white border border-[#E5DFC5]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#667266]">Protein (g)</label>
                    <input
                      type="number"
                      value={formData.nutritionalInfo?.protein}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          nutritionalInfo: {
                            ...formData.nutritionalInfo!,
                            protein: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full p-2 rounded-lg bg-white border border-[#E5DFC5]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#667266]">Carbs (g)</label>
                    <input
                      type="number"
                      value={formData.nutritionalInfo?.carbs}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          nutritionalInfo: {
                            ...formData.nutritionalInfo!,
                            carbs: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full p-2 rounded-lg bg-white border border-[#E5DFC5]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#667266]">Fats (g)</label>
                    <input
                      type="number"
                      value={formData.nutritionalInfo?.fats}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          nutritionalInfo: {
                            ...formData.nutritionalInfo!,
                            fats: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full p-2 rounded-lg bg-white border border-[#E5DFC5]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#F0ECE1]">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-full border border-gray-300 font-semibold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-full bg-[#354B35] text-white font-semibold hover:bg-[#253525] cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#DFC89B]" />
                      <span>{editingProduct ? "Saving..." : "Publishing..."}</span>
                    </>
                  ) : editingProduct ? (
                    "Save Changes"
                  ) : (
                    "Publish to Menu"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs">Loading products...</div>}>
      <ProductsContent />
    </Suspense>
  );
}
