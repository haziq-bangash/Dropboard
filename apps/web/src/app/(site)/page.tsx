import { Uploader } from "@/components/Uploader";
import { Hero } from "@/components/marketing/Hero";
import { HeroFlow } from "@/components/marketing/HeroFlow";
import { AiPrompts, ClosingCta, FeatureRows, Perks, ToolGrid } from "@/components/marketing/Sections";

export default function Home() {
  return (
    // The uploader owns the drop zone and hides this marketing content once a dashboard is built.
    <Uploader
      hero={
        <>
          <Hero />
          <HeroFlow />
        </>
      }
      below={
        <>
          <ToolGrid />
          <FeatureRows />
          <AiPrompts />
          <Perks />
          <ClosingCta />
        </>
      }
    />
  );
}
