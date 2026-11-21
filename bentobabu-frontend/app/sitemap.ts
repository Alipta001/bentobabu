import { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bentobabu.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/menu`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/cart`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  let categoryPages: MetadataRoute.Sitemap = [];
  let productPages: MetadataRoute.Sitemap = [];

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
    const [catRes, prodRes] = await Promise.allSettled([
      fetch(`${apiUrl}/categories`, { next: { revalidate: 3600 } }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${apiUrl}/products?limit=100`, { next: { revalidate: 3600 } }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);

    if (catRes.status === "fulfilled" && catRes.value) {
      const list = Array.isArray(catRes.value.data)
        ? catRes.value.data
        : catRes.value.data?.categories || [];
      categoryPages = list.map((cat: { slug: string }) => ({
        url: `${BASE_URL}/categories/${cat.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }

    if (prodRes.status === "fulfilled" && prodRes.value) {
      const list = Array.isArray(prodRes.value.data)
        ? prodRes.value.data
        : prodRes.value.data?.products || [];
      productPages = list.map((prod: { slug: string }) => ({
        url: `${BASE_URL}/product/${prod.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }
  } catch {
    // fallback gracefully
  }

  return [...staticPages, ...categoryPages, ...productPages];
}

