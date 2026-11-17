/**
 * Central Branding Configuration
 * Easily configurable brand name, logo, typography, contact details, and theme assets.
 */

export interface BrandConfig {
  name: string;
  tagline: string;
  shortDescription: string;
  description: string;
  logo: {
    text: string;
    subtext: string;
    imagePath: string;
    iconSvgPath?: string;
  };
  contact: {
    email: string;
    phone: string;
    whatsapp: string;
    address: string;
    operatingHours: string;
  };
  social: {
    instagram: string;
    facebook: string;
    twitter: string;
    linkedin: string;
  };
  features: {
    enableSubscriptions: boolean;
    enableCoupons: boolean;
    enableScheduledDelivery: boolean;
    enableGuestCheckout: boolean;
  };
  currency: {
    code: string;
    symbol: string;
  };
}

export const brandConfig: BrandConfig = {
  name: "Bento Babu",
  tagline: "Pure Ingredients, Mindful Nutrition",
  shortDescription: "Chef-crafted healthy meals, balanced bowls, and clean nourishment delivered fresh.",
  description:
    "Bento Babu brings gourmet healthy eating to fitness enthusiasts, mindful families, growing kids, and active seniors. Prepared daily with farm-fresh produce and zero preservatives.",
  logo: {
    text: "Bento Babu",
    subtext: "Mindful Kitchen",
    imagePath: "/bentobabu_logo.png",
  },
  contact: {
    email: "care@bentobabu.in",
    phone: "+91 98765 43210",
    whatsapp: "+91 98765 43210",
    address: "Indiranagar 100ft Road, Bengaluru, Karnataka 560038",
    operatingHours: "7:00 AM – 10:30 PM (Daily)",
  },
  social: {
    instagram: "https://instagram.com/bentobabu",
    facebook: "https://facebook.com/bentobabu",
    twitter: "https://twitter.com/bentobabu",
    linkedin: "https://linkedin.com/company/bentobabu",
  },
  features: {
    enableSubscriptions: true,
    enableCoupons: true,
    enableScheduledDelivery: true,
    enableGuestCheckout: true,
  },
  currency: {
    code: "INR",
    symbol: "₹",
  },
};

