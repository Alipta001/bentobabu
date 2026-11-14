import React from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductDetailView } from "@/components/product/ProductDetailView";
import { productService } from "@/services/productService";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await productService.getBySlug(slug);

  if (!product) {
    notFound();
  }

  const related = await productService.getRelated(product.id);

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />
      <main className="flex-1 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProductDetailView product={product} relatedProducts={related} />
        </div>
      </main>
      <Footer />
    </div>
  );
}

