"use client"

import React, { useState, useEffect } from "react"

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function CountdownTimer({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime()
      const target = targetDate.getTime()
      const difference = target - now

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24))
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((difference % (1000 * 60)) / 1000)

        setTimeLeft({ days, hours, minutes, seconds })
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [targetDate])

  const timeUnits = [
    { label: "Days", value: timeLeft.days },
    { label: "Hours", value: timeLeft.hours },
    { label: "Minutes", value: timeLeft.minutes },
    { label: "Seconds", value: timeLeft.seconds },
  ]

  return (
    <div className="inline-flex items-center gap-0 md:gap-2 px-4 md:px-8 bg-card border border-border rounded-lg shadow-sm backdrop-blur-sm mx-auto">
      {timeUnits.map((unit, index) => (
        <React.Fragment key={unit.label}>
          <div className="flex flex-col items-center p-2 md:p-4">
            <div className="font-display text-xl md:text-2xl font-semibold text-foreground">
              {unit.value.toString().padStart(2, "0")}
            </div>
            <div className="text-xs md:text-xs text-muted-foreground">
              {unit.label}
            </div>
          </div>
          {index < timeUnits.length - 1 && (
            <div className="h-8 md:h-12 w-px bg-border mx-2 md:mx-3"></div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}