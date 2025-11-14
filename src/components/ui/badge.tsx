import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-foreground/10 text-foreground",
        success: "bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400",
        warning: "bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400",
        destructive:
          "bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive-foreground",
        outline: "border border-input bg-background text-foreground",
      },
      size: {
        sm: "px-2 h-5 text-[0.68rem]",
        md: "px-2.5 h-6 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };


