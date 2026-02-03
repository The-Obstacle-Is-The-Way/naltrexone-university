import { CtaSection } from '@/components/sections/cta-section';
import { FeaturesSection } from '@/components/sections/features-section';
import { FooterSection } from '@/components/sections/footer-section';
import { HeroSection } from '@/components/sections/hero-section';
import { ImpactSection } from '@/components/sections/impact-section';
import { PricingSection } from '@/components/sections/pricing-section';
import { TestimonialsSection } from '@/components/sections/testimonials-section';
import { Navbar } from '@/components/ui/navbar';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <Navbar />
      <HeroSection />
      <ImpactSection />
      <FeaturesSection />
      <TestimonialsSection />
      <PricingSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
