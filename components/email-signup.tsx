"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, Check, Loader2 } from "lucide-react"
import { addContactAndSendWelcomeEmail } from "@/lib/resend"
import Link from "next/link"
import Image from "next/image"
import { useTheme } from "next-themes"
import { toast } from "sonner"

export function EmailSignup() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isValid, setIsValid] = useState(true)
  const [message, setMessage] = useState("")
  const [mounted, setMounted] = useState(false)
  const { theme, resolvedTheme } = useTheme()

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateEmail(email)) {
      setIsValid(false)
      return
    }

    setIsValid(true)
    setIsLoading(true)
    
    // Test toast to verify toast system is working
    toast.info("Processing your request...", {
      duration: 2000,
    })
    
    try {
      const result = await addContactAndSendWelcomeEmail(email)
      
      if (result.overallSuccess) {
        toast.success("🎉 You're all set!", {
          description: "Welcome to SofiSwap! Check your email for updates.",
          duration: 4000,
        })

        setMessage("")
        setEmail("")
      } else {
        console.log('❌ Toast not showing because overallSuccess is false')
        toast.error("Something went wrong", {
          description: "Please try again or contact support.",
          duration: 4000,
        })
        setMessage("Something went wrong. Please try again.")
        setIsValid(false)
      }
    } catch (error) {
      console.error("Email signup error:", error)
      setMessage("Something went wrong. Please try again.")
      setIsValid(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Determine MySo logo based on theme with proper fallback
  const currentTheme = mounted ? (resolvedTheme || theme || 'light') : 'light'
  const mysoLogo = currentTheme === 'light' ? '/MySo-logo-black.png' : '/MySo-logo-white.png'

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-xl mx-auto" >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <Input
              type="email"
              placeholder="email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setIsValid(true)
              }}
              className={`pl-10 border-[var(--border)] placeholder:text-[var(--muted-foreground)] ${
                !isValid ? "border-red-500 focus:border-red-500" : ""
              }`}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading}
            className="bg-[var(--foreground)] hover:bg-[var(--foreground)] text-[var(--background)]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing up...
              </>
            ) : (
              "Notify Me"
            )}
          </Button>
        </div>
        <div className="text-xs text-[var(--muted-foreground)] text-center">Enter your email to get notified when we launch</div>
        {!isValid && (
          <p className="text-red-500 text-sm mt-1">
            {message || "Please enter a valid email address"}
          </p>
        )}
      </form>

        {/* Social Icons */}
        <div className="flex justify-center items-center gap-6 mt-2">
          {/* Telegram */}
          <Link 
            href="https://t.me/sofiswap_xyz"
            className="transition-colors duration-300 hover:text-foreground opacity-60 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
              <title>Telegram</title>
              <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
            </svg>
          </Link>
  
          {/* X */}
          <Link 
            href="https://x.com/sofiswap_xyz"
            className="transition-colors duration-300 hover:text-foreground opacity-60 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px] fill-current">
              <title>X</title>
              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
            </svg>
          </Link>
  
          {/* MySo Logo */}
          <Link 
            href="https://www.mysocial.network/ecosystem/sofiswap"
            className="transition-all duration-300 hover:opacity-100 opacity-60"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src={mysoLogo}
              alt="MySocial Network"
              width={20}
              height={20}
              className="object-contain"
            />
          </Link>
        </div>
      </div>
  )
}