import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductDetailView } from "@/components/product/ProductDetailView";
import { productService } from "@/services/productService";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ date?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await productService.getBySlug(slug);

  if (!product) {
    return {
      title: "Product Not Found",
      robots: { index: false, follow: false },
    };
  }

  const plainDescription = (product.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return {
    title: product.name,
    description: plainDescription || `Order fresh ${product.name} from BentoBabu.`,
    alternates: {
      canonical: `/product/${product.slug}`,
    },
    openGraph: {
      title: product.name,
      description: plainDescription || `Order fresh ${product.name} from BentoBabu.`,
      images: product.imageUrl ? [{ url: product.imageUrl, alt: product.name }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const deliveryDate = resolvedSearchParams?.date;
  const product = await productService.getBySlug(slug, deliveryDate);

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

