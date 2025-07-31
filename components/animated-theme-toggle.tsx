"use client"

import { useId, useState, useEffect } from "react"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function AnimatedThemeToggle() {
  const id = useId()
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true)
  }, [])

  const isLight = theme === "light"

  const handleToggle = (checked: boolean) => {
    setTheme(checked ? "light" : "dark")
  }

  if (!mounted) {
    // Render a placeholder that matches the final component's dimensions
    return (
      <div>
        <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
            <div className="peer data-[state=unchecked]:bg-input/50 absolute inset-0 h-[inherit] w-auto rounded-lg bg-input/50" />
          <span className="pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center">
            <div className="w-4 h-4" />
          </span>
          <span className="pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center">
            <div className="w-4 h-4" />
          </span>
        </div>
        <Label htmlFor={id} className="sr-only">
          Toggle theme
        </Label>
      </div>
    )
  }

  return (
    <div>
      <div className="relative inline-grid h-7 grid-cols-[1fr_1fr] items-center text-sm font-medium">
        <Switch
          id={id}
          checked={isLight}
          onCheckedChange={handleToggle}
          className="peer data-[state=unchecked]:bg-[var(--foreground)] data-[state=checked]:bg-[var(--foreground)] absolute inset-0 h-[inherit] w-auto rounded-lg [&>*]:z-10 [&>*]:h-full [&>*]:w-1/2 [&>*]:rounded-md [&>*]:!bg-[var(--background)] [&>*]:transition-transform [&>*]:duration-300 [&>*]:ease-out [&>*]:data-[state=checked]:translate-x-full [&>*]:data-[state=checked]:rtl:-translate-x-full"
        />
        <span className="pointer-events-none relative ms-0.5 flex min-w-12 items-center justify-center text-center transition-transform duration-300 ease-out peer-data-[state=checked]:invisible peer-data-[state=unchecked]:translate-x-full peer-data-[state=unchecked]:rtl:-translate-x-full text-slate-900">
          <MoonIcon size={16} aria-hidden="true" />
        </span>
        <span className="pointer-events-none relative px-2 me-0.5 flex min-w-2 items-center justify-center text-center transition-transform duration-300 ease-out peer-data-[state=checked]:-translate-x-full peer-data-[state=unchecked]:invisible peer-data-[state=checked]:rtl:translate-x-full text-white">
          <SunIcon size={16} aria-hidden="true" />
        </span>
      </div>
      <Label htmlFor={id} className="sr-only">
        Toggle theme
      </Label>
    </div>
  )
} 