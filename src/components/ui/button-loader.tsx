import { ThemedLottie } from "@/components/shared/ThemedLottie";
import { cn } from "@/lib/utils";

interface ButtonLoaderProps {
  className?: string;
}

export function ButtonLoader({ className }: ButtonLoaderProps) {
  return (
    <span data-slot="loader" className={cn("inline-flex items-center justify-center", className)}>
      <ThemedLottie style={{ width: "100%", height: "100%" }} />
    </span>
  );
}

export default ButtonLoader;
