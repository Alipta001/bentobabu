"use client";

import React, { useState } from "react";
import { Plus, X, Edit, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminCategories,
  useCreateCategory,
  useToggleCategoryStatus,
  useDeleteCategory,
} from "@/hooks/useAdminQueries";
import { categoryService } from "@/services/categoryService";
import { Category, ProductMediaImage } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { MediaImageUpload } from "@/components/media/MediaImageUpload";

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const { data: categories = [], isLoading } = useAdminCategories();
  const createCategoryMutation = useCreateCategory();
  const toggleCategoryMutation = useToggleCategoryStatus();
  const deleteCategoryMutation = useDeleteCategory();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(
    "https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=800&q=80"
  );
  const [imageData, setImageData] = useState<ProductMediaImage | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setName("");
    setSlug("");
    setTagline("");
    setDescription("");
    setImage("https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=800&q=80");
    setImageData(undefined);
    setModalOpen(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setTagline(cat.tagline || "");
    setDescription(cat.description || "");
    setImage(cat.image || "");
    setImageData(cat.imageData);
    setModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingCategory) {
        await categoryService.update(editingCategory.id, {
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
          description,
          image,
          imageData,
        });
        queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      } else {
        await createCategoryMutation.mutateAsync({
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
          tagline,
          description,
          image,
          imageData,
          isActive: true,
        });
      }

      setModalOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save category.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (cat: Category) => {
    try {
      await toggleCategoryMutation.mutateAsync({
        id: cat.id,
        isActive: !cat.isActive,
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update category status.");
    }
  };

  const handleDelete = async (cat: Category) => {
    if (confirm(`Are you sure you want to delete category "${cat.name}"? Products assigned to it will be safely unlinked.`)) {
      try {
        await deleteCategoryMutation.mutateAsync(cat.id);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Failed to delete category.");
      }
    }
  };

  return (
    <AdminShell
      title="Targeted Nutritional Collections"
      subtitle="Manage the 7 primary customer segments, category imagery, descriptions and active availability"
    >
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs">
        <div>
          <h3 className="font-serif text-lg font-bold text-[#1F271F]">
            Categories ({categories.length})
          </h3>
          <p className="text-xs text-[#667266]">
            Products belong to nutritional collections to guide customer ordering
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#B99A60]" />
          <span>New Category</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 p-12 text-center text-xs text-[#667266]">
            Loading categories...
          </div>
        ) : (
          categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden flex flex-col justify-between"
            >
              <div className="relative h-44 w-full bg-[#EDE8DE] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 text-white">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#B99A60]">
                    Slug: {cat.slug}
                  </span>
                  <h4 className="font-serif text-xl font-bold">{cat.name}</h4>
                </div>
              </div>

              <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-1">
                  {cat.tagline && (
                    <p className="text-xs font-semibold text-[#B99A60]">
                      {cat.tagline}
                    </p>
                  )}
                  <p className="text-xs text-[#667266] line-clamp-3 leading-relaxed">
                    {cat.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#F0ECE1] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(cat)}
                      className="cursor-pointer text-[#354B35]"
                      title="Toggle Category Status"
                    >
                      {cat.isActive ? (
                        <ToggleRight className="w-6 h-6 text-emerald-700" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        cat.isActive
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {cat.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#8A9A86] font-medium">
                      {cat.itemCount || 0} dishes
                    </span>
                    <button
                      onClick={() => handleOpenEdit(cat)}
                      className="p-1.5 rounded-lg border border-[#E5DFC5] text-[#354B35] hover:bg-[#F7F3EA] cursor-pointer"
                      title="Edit Category"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                      title="Delete Category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5]">
            <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE1]">
              <h3 className="font-serif text-xl font-bold text-[#1F271F]">
                {editingCategory ? "Edit Category" : "Add Collection"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">Category Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Corporate Lunch Combos"
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">URL Slug</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="corporate-lunch"
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                />
              </div>

              <div className="space-y-1">
                <MediaImageUpload
                  label="Category Banner Image (Cloudinary)"
                  folder="bentobabu/categories"
                  categoryId={editingCategory?.id}
                  initialImages={imageData ? [imageData] : []}
                  initialImageUrl={image}
                  maxFiles={1}
                  onChange={(imgs, primaryUrl) => {
                    setImage(primaryUrl);
                    setImageData(imgs[0]);
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#F0ECE1]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-gray-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-full bg-[#354B35] text-white font-semibold cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : "Save Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
