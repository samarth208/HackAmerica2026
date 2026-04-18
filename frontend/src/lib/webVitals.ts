import { onCLS, onFCP, onFID, onLCP, onTTFB, onINP } from "web-vitals";

type VitalsCallback = (metric: {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
}) => void;

export function reportWebVitals(callback: VitalsCallback): void {
  onCLS(callback);
  onFCP(callback);
  onFID(callback);
  onLCP(callback);
  onTTFB(callback);
  onINP(callback);
}

export function logVitalsToConsole(): void {
  reportWebVitals(({ name, value, rating }) => {
    const color =
      rating === "good"
        ? "#10b981"
        : rating === "needs-improvement"
        ? "#f59e0b"
        : "#ef4444";
    console.log(
      `%c[Web Vitals] ${name}: ${value.toFixed(1)} (${rating})`,
      `color: ${color}; font-weight: bold`
    );
  });
}
