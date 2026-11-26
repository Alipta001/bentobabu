import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

interface SitemapCategory {
  slug?: string;
  isActive?: boolean;
}

interface SitemapProduct {
  slug?: string;
  isActive?: boolean;
  isAvailable?: boolean;
}

interface SitemapVideo {
  slug?: string;
  status?: string;
}

async function fetchAllActiveProducts(apiUrl: string): Promise<SitemapProduct[]> {
  const allProducts: SitemapProduct[] = [];
  const limit = 100;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${apiUrl}/products?page=${page}&limit=${limit}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) break;

    const json = await res.json();
    const list: SitemapProduct[] = Array.isArray(json.data)
      ? json.data
      : json.data?.products || [];

    if (list.length === 0) break;
    allProducts.push(...list);

    const totalPages = json.pagination?.totalPages;
    if (typeof totalPages === "number" ? page >= totalPages : list.length < limit) {
      break;
    }
  }

  return allProducts;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/menu`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/videos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/support`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/google-privacy-policy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  let categoryPages: MetadataRoute.Sitemap = [];
  let productPages: MetadataRoute.Sitemap = [];
  let videoPages: MetadataRoute.Sitemap = [];

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
    const [catRes, allProducts, videoRes] = await Promise.allSettled([
      fetch(`${apiUrl}/categories`, { next: { revalidate: 3600 } }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetchAllActiveProducts(apiUrl),
      fetch(`${apiUrl}/videos?limit=100`, { next: { revalidate: 3600 } }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);

    if (catRes.status === "fulfilled" && catRes.value) {
      const list: SitemapCategory[] = Array.isArray(catRes.value.data)
        ? catRes.value.data
        : catRes.value.data?.categories || [];
      categoryPages = list
        .filter((cat) => Boolean(cat.slug) && cat.isActive !== false)
        .map((cat) => ({
          url: `${SITE_URL}/categories/${cat.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        }));
    }

    if (allProducts.status === "fulfilled") {
      productPages = allProducts.value
        .filter((prod) => Boolean(prod.slug) && prod.isActive !== false && prod.isAvailable !== false)
        .map((prod) => ({
          url: `${SITE_URL}/product/${prod.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        }));
    }

    if (videoRes.status === "fulfilled" && videoRes.value) {
      const list: SitemapVideo[] = Array.isArray(videoRes.value.data)
        ? videoRes.value.data
        : videoRes.value.data?.videos || [];
      videoPages = list
        .filter((v) => Boolean(v.slug) && (!v.status || v.status === "PUBLISHED"))
        .map((v) => ({
          url: `${SITE_URL}/videos/${v.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }));
    }
  } catch {
    // fallback gracefully
  }

  return [...staticPages, ...categoryPages, ...productPages, ...videoPages];
}
