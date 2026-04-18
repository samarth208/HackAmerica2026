// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";

interface SkeletonLoaderProps {
  variant?: "page" | "card" | "table" | "text";
}

export default function SkeletonLoader({
  variant = "page",
}: SkeletonLoaderProps): React.ReactElement {
  if (variant === "card") {
    return <div className="h-16 bg-surface rounded animate-pulse w-full" />;
  }

  if (variant === "table") {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-5 bg-surface rounded animate-pulse w-full" />
        ))}
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className="space-y-2">
        <div className="h-4 bg-surface rounded animate-pulse w-full" />
        <div className="h-4 bg-surface rounded animate-pulse w-3/5" />
      </div>
    );
  }

  // "page" (default)
  return (
    <div className="space-y-4 p-4">
      <div className="h-10 bg-surface rounded animate-pulse w-full" />
      <div className="h-48 bg-surface rounded animate-pulse w-full" />
      <div className="h-28 bg-surface rounded animate-pulse w-full" />
    </div>
  );
}
