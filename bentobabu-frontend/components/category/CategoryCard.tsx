import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Category } from "@/types";

interface CategoryCardProps {
  category: Category;
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group relative flex flex-col justify-end h-80 rounded-3xl overflow-hidden shadow-xs hover:shadow-2xl transition-all duration-300 border border-[#E5DFC5]"
    >
      {/* Background Image */}
      <Image
        src={category.image}
        alt={category.name}
        fill
        sizes="(max-width: 640px) 380px, (max-width: 1024px) 50vw, 33vw"
        className="object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
        loading="lazy"
      />

      {/* Botanical Dark Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1F2C1F] via-[#2F412F]/60 to-transparent group-hover:via-[#2F412F]/40 transition-colors duration-300" />

      {/* Content */}
      <div className="relative p-6 z-10 text-white space-y-2">
        <span className="text-[10px] uppercase font-bold tracking-widest text-[#DFC89B]">
          Collection
        </span>
        <h3 className="font-serif text-2xl font-bold tracking-tight text-[#F7F3EA] group-hover:text-white transition-colors">
          {category.name}
        </h3>
        <p className="text-xs text-[#EDE8DE]/90 line-clamp-2 leading-relaxed">
          {category.tagline || category.description}
        </p>

        <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-[#DFC89B] group-hover:text-white group-hover:translate-x-1 transition-all">
          <span>Explore meals</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}

