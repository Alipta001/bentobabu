import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Sparkles,
  ArrowRight,
  Leaf,
  CheckCircle2,
  Utensils,
  Award,
  Truck,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/product/ProductCard";
import { CategoryCard } from "@/components/category/CategoryCard";
import { VideoCard } from "@/components/video/VideoCard";
import { FaqAccordion } from "@/components/home/FaqAccordion";
import { NewsletterForm } from "@/components/home/NewsletterForm";
import { brandConfig } from "@/config/brand";
import { INITIAL_PRODUCTS } from "@/lib/data/products";
import { Category, Product, VideoContent } from "@/types";
import { normalizeProduct } from "@/services/productService";

async function getHomeData(): Promise<{
  categories: Category[];
  bestsellers: Product[];
  featuredVideos: VideoContent[];
}> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
    const [categoriesRes, bestsellersRes, videosRes] = await Promise.allSettled([
      fetch(`${apiUrl}/categories`, { next: { revalidate: 60 } }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${apiUrl}/products?limit=4`, { next: { revalidate: 60 } }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${apiUrl}/videos/featured?limit=3`, { next: { revalidate: 60 } }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);

    let categories: Category[] = [];
    if (categoriesRes.status === "fulfilled" && categoriesRes.value) {
      const d = categoriesRes.value.data;
      if (Array.isArray(d?.categories)) {
        categories = d.categories;
      } else if (Array.isArray(d)) {
        categories = d;
      }
    }

    let bestsellers: Product[] = INITIAL_PRODUCTS.slice(0, 4);
    if (bestsellersRes.status === "fulfilled" && bestsellersRes.value) {
      const d = bestsellersRes.value.data;
      if (Array.isArray(d?.products) && d.products.length > 0) {
        bestsellers = d.products.map(normalizeProduct);
      } else if (Array.isArray(d) && d.length > 0) {
        bestsellers = d.map(normalizeProduct).slice(0, 4);
      }
    }

    let featuredVideos: VideoContent[] = [];
    if (videosRes.status === "fulfilled" && videosRes.value) {
      const d = videosRes.value.data;
      if (Array.isArray(d?.videos)) {
        featuredVideos = d.videos;
      } else if (Array.isArray(d)) {
        featuredVideos = d;
      }
    }

    return { categories, bestsellers, featuredVideos };
  } catch {
    return {
      categories: [],
      bestsellers: [],
      featuredVideos: [],
    };
  }
}

const faqs = [
  {
    q: "How does Bento Babu ensure fresh, preservative-free meals?",
    a: "All vegetables, grains, and meats are sourced daily before 5:00 AM from verified local farm partners. Meals are cooked in small, controlled batches right before dispatch in our sterilized, temperature-regulated kitchen. We never use artificial colors, chemical preservatives, or refined seed oils.",
  },
  {
    q: "Can I customize meals for senior citizens or young school children?",
    a: "For Now NO! We currently offer pre-designed meal plans for adults, fitness enthusiasts, and office-goers. However, we are actively working on expanding our menu to include customized food for senior and kid in the near future.",
  },
  {
    q: "What is preparation time for orders?",
    a: "All meals are cooked fresh in small batches. Once your order is confirmed, it takes 30 to 45 minutes to prepare and pack your meal before dispatch.",
  },
  {
    q: "What is your delivery turnaround time?",
    a: "We deliver within 45 to 60 minutes of Rider confirmation. Each order is dispatched in high-grade eco-friendly insulated packaging that maintains optimal serving temperature without plastic sweating.",
  },
  {
    q: "Are the nutritional metrics (calories, protein) lab-tested?",
    a: "Yes. Every standardized recipe is formulated in consultation with certified clinical sports nutritionists and verified with standard food testing databases for exact macro distributions.",
  },
  {
    q: "Do you offer daily or weekly office meal subscriptions?",
    a: "Yes, our Executive and Fitness Meal subscriptions allow you to pre-schedule your work lunches or post-workout meals from Monday through Friday with flexible pause and cancel options.",
  },
];

export default async function HomePage() {
  const { categories, bestsellers, featuredVideos } = await getHomeData();

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1">
        {/* 1. Hero Section */}
        <section className="relative overflow-hidden pt-8 pb-20 md:pt-16 md:pb-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Hero Text */}
              <div className="lg:col-span-7 space-y-6 text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#354B35]/10 border border-[#354B35]/20 text-[#354B35] text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-[#755C2B]" />
                  <span>Fresh, wholesome meals made for every generation.</span>
                </div>

                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#243324] tracking-tight leading-[1.15]">
                  Eat Better. Live Better.{" "}
                  <span className="italic font-normal text-[#354B35] underline decoration-[#B99A60]/60 decoration-wavy">
                    Love Every Bite.
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-[#4A584A] max-w-2xl leading-relaxed">
                  From protein-packed fitness bowls and nourishing millet meals to wholesome office lunches and healthy school snacks — BentoBabu brings delicious, balanced food to your everyday life. Freshly prepared in Barrackpore with quality ingredients and no compromise on taste.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
                  <Link
                    href="/menu"
                    className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-[#354B35] text-[#F7F3EA] text-sm font-bold shadow-lg hover:bg-[#253525] hover:scale-102 transition-all duration-200"
                  >
                    <span>Order Fresh Now</span>
                    <ArrowRight className="w-4 h-4 text-[#DFC89B]" />
                  </Link>
                  <Link
                    href="/#why-choose-us"
                    className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-[#354B35]/30 text-[#354B35] text-sm font-semibold hover:bg-white transition-colors"
                  >
                    <span>Our Nutrition Philosophy</span>
                  </Link>
                </div>

                {/* Hero Trust Points */}
                <div className="pt-6 grid grid-cols-3 gap-4 border-t border-[#E5DFC5]">
                  <div>
                    <div className="font-serif text-2xl font-bold text-[#354B35]">
                      100%
                    </div>
                    <div className="text-xs text-[#4A584A]">Preservative Free</div>
                  </div>
                  <div>
                    <div className="font-serif text-2xl font-bold text-[#354B35]">
                      35m
                    </div>
                    <div className="text-xs text-[#4A584A]">Average Delivery</div>
                  </div>
                  <div>
                    <div className="font-serif text-2xl font-bold text-[#354B35]">
                      40+ g
                    </div>
                    <div className="text-xs text-[#4A584A]">Peak Protein Bowls</div>
                  </div>
                </div>
              </div>

              {/* Hero Visual Imagery */}
              <div className="lg:col-span-5 relative">
                <div className="relative mx-auto max-w-md lg:max-w-none">
                  {/* Decorative backdrop glow */}
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-[#354B35]/20 to-[#B99A60]/20 blur-2xl transform rotate-3" />

                  {/* Main Image Container */}
                  <div className="relative rounded-3xl overflow-hidden border-4 border-white shadow-2xl aspect-4/5 bg-[#EDE8DE]">
                    <Image
                      src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1000&q=80"
                      alt="Signature Healthy Bento Bowl"
                      fill
                      priority
                      fetchPriority="high"
                      loading="eager"
                      sizes="(max-width: 640px) 380px, (max-width: 1024px) 450px, 500px"
                      className="w-full h-full object-cover"
                    />

                    {/* Floating Macro Pill 1 */}
                    <div className="absolute top-6 left-6 bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-[#E5DFC5] flex items-center gap-3 animate-in fade-in slide-in-from-top duration-700">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
                        <Leaf className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#222922]">Farm Fresh</div>
                        <div className="text-[10px] text-[#4A584A]">Daily Organic Harvest</div>
                      </div>
                    </div>

                    {/* Floating Macro Pill 2 */}
                    <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-[#E5DFC5] flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-700">
                      <div className="w-10 h-10 rounded-xl bg-[#354B35] text-[#DFC89B] flex items-center justify-center font-bold">
                        <Award className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#222922]">Chef Calibrated</div>
                        <div className="text-[10px] text-[#4A584A]">Verified Nutrients</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Target Food Categories Section */}
        <section className="py-16 bg-[#EDE8DE]/60 border-y border-[#E5DFC5]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
              <div className="space-y-2">
                <span className="text-xs uppercase font-bold tracking-widest text-[#755C2B]">
                  Targeted Nutrition
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#243324]">
                  Food Tailored for Your Lifestyle
                </h2>
                <p className="text-sm text-[#4A584A] max-w-xl">
                  From high-protein muscle fuel to calming digestive meals, choose recipes
                  crafted specifically for your daily goals.
                </p>
              </div>
              <Link
                href="/menu"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#354B35] hover:text-[#755C2B] transition-colors"
              >
                <span>Explore Full Menu</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {categories.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.map((category) => (
                  <CategoryCard key={category.id || category.slug} category={category} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-3xl border border-[#E5DFC5] p-8">
                <p className="text-sm text-[#4A584A]">
                  Fresh culinary collections are currently being prepared by our chefs.
                </p>
                <Link
                  href="/menu"
                  className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold"
                >
                  Browse Menu
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* 3. Bestselling Products */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
              <span className="text-xs uppercase font-bold tracking-widest text-[#755C2B]">
                Customer Favorites
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#243324]">
                Most Loved Healthy Bentos
              </h2>
              <p className="text-sm text-[#4A584A]">
                Our most frequently ordered chef specials, praised for rich flavor and
                balanced nutrition.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {bestsellers.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            <div className="text-center mt-12">
              <Link
                href="/menu"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-sm font-semibold hover:bg-[#253525] transition-all shadow-md"
              >
                <span>Browse Complete Food Menu</span>
                <ArrowRight className="w-4 h-4 text-[#DFC89B]" />
              </Link>
            </div>
          </div>
        </section>

        {/* 3.5 Featured Kitchen & Recipe Videos Section */}
        {featuredVideos.length > 0 && (
          <section className="py-20 bg-[#EDE8DE]/50 border-t border-[#E5DFC5]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 text-xs uppercase font-bold tracking-widest text-[#755C2B]">
                    <Sparkles className="w-3.5 h-3.5 text-[#8C713B]" />
                    <span>Watch & Learn</span>
                  </div>
                  <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#243324]">
                    Kitchen Stories & Healthy Recipes
                  </h2>
                  <p className="text-sm text-[#4A584A] max-w-xl">
                    Discover how our chefs craft mindful nutrition, step-by-step recipes, and culinary tips for balanced everyday dining.
                  </p>
                </div>
                <Link
                  href="/videos"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#354B35] hover:text-[#755C2B] transition-colors"
                >
                  <span>Explore All Videos</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredVideos.slice(0, 3).map((video) => (
                  <VideoCard key={video._id || video.slug} video={video} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 4. Why Choose Us Section */}
        <section id="why-choose-us" className="py-20 bg-[#354B35] text-[#F7F3EA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center space-y-3 mb-16">
              <span className="text-xs uppercase font-bold tracking-widest text-[#DFC89B]">
                The Bento Babu Promise
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
                Clean Eating Should Feel Like a Celebration
              </h2>
              <p className="text-sm sm:text-base text-[#EDE8DE]/90 leading-relaxed">
                We believe healthy food shouldn&apos;t mean bland boiled vegetables. We combine
                traditional Indian culinary wisdom with modern nutritional science.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Pillar 1 */}
              <div className="bg-[#243324] rounded-3xl p-8 border border-[#4A654A] space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#354B35] flex items-center justify-center text-[#DFC89B]">
                  <Leaf className="w-7 h-7" />
                </div>
                <h3 className="font-serif text-xl font-bold text-white">
                  Zero Preservatives & Palm Oil
                </h3>
                <p className="text-xs text-[#B5C4B1] leading-relaxed">
                  Cooked exclusively in cold-pressed mustard, peanut, and olive oils or A2
                  cow ghee. Never reheated from frozen blocks.
                </p>
                <ul className="space-y-2 text-xs text-[#EDE8DE]/90 pt-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFC89B]" />
                    <span>Stone-ground whole spices</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFC89B]" />
                    <span>Hormone-free poultry & fresh paneer</span>
                  </li>
                </ul>
              </div>

              {/* Pillar 2 */}
              <div className="bg-[#243324] rounded-3xl p-8 border border-[#4A654A] space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#354B35] flex items-center justify-center text-[#DFC89B]">
                  <Utensils className="w-7 h-7" />
                </div>
                <h3 className="font-serif text-xl font-bold text-white">
                  Calibrated Micronutrients
                </h3>
                <p className="text-xs text-[#B5C4B1] leading-relaxed">
                  Every bowl displays transparent verified macros: protein, carbs, healthy
                  fats, and dietary fiber calculated accurately.
                </p>
                <ul className="space-y-2 text-xs text-[#EDE8DE]/90 pt-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFC89B]" />
                    <span>Optimal glycemic index control</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFC89B]" />
                    <span>Gut-friendly probiotic options</span>
                  </li>
                </ul>
              </div>

              {/* Pillar 3 */}
              <div className="bg-[#243324] rounded-3xl p-8 border border-[#4A654A] space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#354B35] flex items-center justify-center text-[#DFC89B]">
                  <Truck className="w-7 h-7" />
                </div>
                <h3 className="font-serif text-xl font-bold text-white">
                  Eco-Insulated Bento Delivery
                </h3>
                <p className="text-xs text-[#B5C4B1] leading-relaxed">
                  Delivered hot and crisp in biodegradable heat-locking containers within
                  35-45 minutes of cooking.
                </p>
                <ul className="space-y-2 text-xs text-[#EDE8DE]/90 pt-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFC89B]" />
                    <span>Zero plastic sweating</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFC89B]" />
                    <span>Tamper-evident hygiene seal</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. How Ordering Works */}
        <section className="py-20 bg-[#F7F3EA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
              <span className="text-xs uppercase font-bold tracking-widest text-[#755C2B]">
                Simple & Convenient
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#243324]">
                How Your Bento Reaches You
              </h2>
              <p className="text-sm text-[#4A584A]">
                Effortless ordering from our kitchen to your doorstep in three easy steps.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              <div className="bg-white rounded-3xl p-8 border border-[#E5DFC5] shadow-xs text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#354B35] text-[#DFC89B] font-serif text-xl font-bold flex items-center justify-center mx-auto shadow-sm">
                  1
                </div>
                <h3 className="font-serif text-xl font-bold text-[#222922]">
                  Choose Your Nutrition
                </h3>
                <p className="text-xs text-[#4F5B4F] leading-relaxed">
                  Browse by fitness goals, age-specific dietary preferences, or macro targets
                  with full ingredient transparency.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-8 border border-[#E5DFC5] shadow-xs text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#354B35] text-[#DFC89B] font-serif text-xl font-bold flex items-center justify-center mx-auto shadow-sm">
                  2
                </div>
                <h3 className="font-serif text-xl font-bold text-[#222922]">
                  Crafted by Chefs
                </h3>
                <p className="text-xs text-[#4F5B4F] leading-relaxed">
                  Prepared on-demand using fresh seasonal vegetables, stone-ground masalas,
                  and sterile kitchen standards.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-8 border border-[#E5DFC5] shadow-xs text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#354B35] text-[#DFC89B] font-serif text-xl font-bold flex items-center justify-center mx-auto shadow-sm">
                  3
                </div>
                <h3 className="font-serif text-xl font-bold text-[#222922]">
                  Insulated 35m Delivery
                </h3>
                <p className="text-xs text-[#4F5B4F] leading-relaxed">
                  Rushed directly to your home, school, gym, or desk at optimal eating
                  temperature.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Subscription / Meal Plan Highlight */}
        <section className="py-16 bg-[#EDE8DE]/70 border-t border-[#E5DFC5]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-[#243324] text-white rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-xl">
              <div className="max-w-2xl space-y-4">
                <span className="text-xs uppercase font-bold tracking-widest text-[#DFC89B]">
                  Flexible Corporate & Fitness Plans
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">
                  Take the Friction Out of Daily Healthy Eating
                </h2>
                <p className="text-xs sm:text-sm text-[#B5C4B1] leading-relaxed">
                  Never worry about what to eat for lunch or dinner again. Pre-schedule your
                  weekly lunch bentos with our customizable 5-day and 20-day nutritional subscriptions.
                </p>
                <div className="pt-2 flex flex-wrap gap-4">
                  <Link
                    href="/menu"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#B99A60] text-[#243324] font-bold text-xs hover:bg-[#DFC89B] transition-colors"
                  >
                    <span>View Subscription Menu</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href={`https://wa.me/${brandConfig.contact.whatsapp.replace(/[^0-9]/g, "")}?text=Hi,%20I%20am%20interested%20in%20Bento%20Babu%20meal%20plans`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/30 text-white text-xs font-semibold hover:bg-white/10 transition-colors"
                  >
                    <span>Chat on WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FAQ Section */}
        <section id="faq" className="py-20 bg-[#F7F3EA]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-3 mb-12">
              <span className="text-xs uppercase font-bold tracking-widest text-[#755C2B]">
                Got Questions?
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#243324]">
                Frequently Asked Questions
              </h2>
              <p className="text-sm text-[#4A584A]">
                Everything you need to know about our ingredients, delivery, and nutrition standards.
              </p>
            </div>

            <FaqAccordion faqs={faqs} />
          </div>
        </section>

        {/* 8. Newsletter Section */}
        <section className="py-16 bg-[#EDE8DE] border-t border-[#E5DFC5]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
            <span className="text-xs uppercase font-bold tracking-widest text-[#755C2B]">
              Stay Nourished
            </span>
            <h2 className="font-serif text-3xl font-bold text-[#243324]">
              Weekly Nutrition Tips & Exclusive Chef Specials
            </h2>
            <p className="text-xs sm:text-sm text-[#4A584A] max-w-xl mx-auto">
              Join 12,000+ mindful eaters in Bengaluru receiving seasonal fruit updates,
              special discounts, and nutritionist recommendations.
            </p>

            <NewsletterForm />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
