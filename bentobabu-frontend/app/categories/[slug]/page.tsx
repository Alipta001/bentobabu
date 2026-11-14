import React from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/product/ProductCard";
import { categoryService } from "@/services/categoryService";
import { productService } from "@/services/productService";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = await categoryService.getBySlug(slug);

  if (!category) {
    notFound();
  }

  const products = await productService.getAll({ categoryId: category.id });

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Breadcrumb / Back Link */}
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#354B35] hover:text-[#B99A60] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Categories</span>
          </Link>

          {/* Category Hero Banner */}
          <div className="relative rounded-3xl overflow-hidden shadow-md border border-[#E5DFC5] min-h-[320px] flex items-end">
            <Image
              src={category.image}
              alt={category.name}
              fill
              priority
              fetchPriority="high"
              loading="eager"
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1F2C1F] via-[#2F412F]/75 to-transparent" />

            <div className="relative p-8 sm:p-12 text-white max-w-3xl space-y-3 z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-semibold text-[#DFC89B]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Targeted Nutrition Collection</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#F7F3EA]">
                {category.name}
              </h1>
              <p className="text-xs sm:text-sm text-[#EDE8DE] leading-relaxed">
                {category.description}
              </p>
            </div>
          </div>

          {/* Product Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#626F62] font-medium">
              <span>{products.length} healthy meals available in this collection</span>
            </div>

            {products.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] space-y-3">
                <h3 className="font-serif text-xl font-bold text-[#222922]">
                  Fresh Batches Preparing Soon
                </h3>
                <p className="text-xs text-[#6B776A] max-w-sm mx-auto">
                  Our chefs are currently preparing the seasonal ingredients for this collection.
                </p>
                <Link
                  href="/menu"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold"
                >
                  Browse Other Categories
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
