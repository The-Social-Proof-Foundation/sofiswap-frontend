"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, Check, Loader2 } from "lucide-react"
import { addContactAndSendWelcomeEmail } from "@/lib/resend"

export function EmailSignup() {
  const [email, setEmail] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValid, setIsValid] = useState(true)
  const [message, setMessage] = useState("")

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
    
    try {
      const result = await addContactAndSendWelcomeEmail(email)
      
      if (result.overallSuccess) {
        setIsSubmitted(true)
        setMessage("Successfully subscribed!")
        setEmail("")
      } else {
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
    
    // Reset success message after 5 seconds
    if (isSubmitted) {
      setTimeout(() => {
        setIsSubmitted(false)
        setMessage("")
      }, 5000)
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg border border-green-200 dark:border-green-800">
        <Check className="w-5 h-5" />
        <span>{message}</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-xl mx-auto" >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="email"
            placeholder="email address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setIsValid(true)
            }}
            className={`pl-10 placeholder:text-[var(--muted-foreground)] ${
              !isValid ? "border-red-500 focus:border-red-500" : ""
            }`}
            required
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading}
          className="bg-[var(--foreground)] hover:bg-[var(--foreground)]/50 text-[var(--background)]"
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
  )
}