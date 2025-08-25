import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "../../lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center py-4",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track 
      className="relative w-full grow overflow-hidden rounded-full"
      style={{ 
        height: '6px',
        backgroundColor: '#e5e7eb' // Tailwind's gray-200
      }}
    >
      <SliderPrimitive.Range 
        className="absolute h-full" 
        style={{ backgroundColor: '#3b82f6' }} // Tailwind's blue-500
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb 
      className="rounded-full border-2 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
      style={{ 
        height: '16px', 
        width: '16px', 
        borderColor: '#3b82f6', // Tailwind's blue-500
        backgroundColor: 'white',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }