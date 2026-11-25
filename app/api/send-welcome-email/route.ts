import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { z } from 'zod'
import { addContactToResend, type ResendContact } from '@/lib/resend'
import { WelcomeEmail } from '@/components/email-templates'
import {
  clientKey,
  enforceRateLimit,
  isAllowedOrigin,
} from '@/lib/api-guard'

// Route configuration
export const runtime = 'nodejs'
export const maxDuration = 30 // 30 seconds timeout

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * This endpoint sends mail from the project's verified Resend domain, so it must not be an
 * open relay: it is same-origin restricted, strictly rate limited, and the links inside the
 * message are derived server-side. `baseUrl` from the caller is ignored — previously it was
 * interpolated into the email's links and images, letting anyone send brand-consistent
 * phishing mail to arbitrary recipients.
 */
const welcomeEmailSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
})

// Environment variables needed:
// RESEND_API_KEY - Your Resend API key
// RESEND_AUDIENCE_ID - Your Resend audience ID for the general mailing list
// RESEND_FROM_EMAIL - The from email address (defaults to brandon@sofiswap.xyz)

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin')
    if (!isAllowedOrigin(origin)) {
      return NextResponse.json(
        { success: false, message: 'This origin is not allowed to request emails' },
        { status: 403 }
      )
    }

    const limit = enforceRateLimit(`welcome-email:${clientKey(request)}`, 5, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { success: false, message: 'Too many signup attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Parse request body with error handling
    let body;
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      )
    }

    const parsed = welcomeEmailSchema.safeParse(body || {})
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'A valid email address is required' },
        { status: 400 }
      )
    }

    const { email, firstName, lastName } = parsed.data

    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not configured')
      return NextResponse.json(
        { success: false, message: 'Email service not configured' },
        { status: 500 }
      )
    }

    // Add user to the Resend audience/contact list first
    const contact: ResendContact = {
      email,
      firstName,
      lastName
    }

    const contactResult = await addContactToResend(contact)
    console.log('📋 Contact addition result:', contactResult.success ? '✅' : '❌', contactResult.message)

    // Continue with email sending even if contact addition fails
    // The email is the primary goal, contact list is secondary
    // Links are always built from server-side configuration, never from the request body.
    const emailBaseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://sofiswap.xyz').replace(/\/$/, '')
    
    // Render the React Email template to HTML
    const emailHtml = await render(WelcomeEmail({
      firstName: firstName || undefined,
      email,
      baseUrl: emailBaseUrl
    }))

    // Create a simple text version for email clients that don't support HTML
    const emailText = `
Welcome to SofiSwap, ${firstName || 'there'}!

Thank you for joining SofiSwap! We're thrilled to have you as part of our growing community.

We're working hard to launch and can't wait to share this revolutionary platform with you. Stay tuned for exclusive updates!

Follow us on social media for the latest updates and join our growing community:
- X (Twitter): https://x.com/chatr_social
- Telegram: https://t.me/chatr_social  
- MySocial: https://www.mysocial.network/ecosystem/sofiswap

Questions? Join our Telegram community for support and updates.

Best regards,
The SofiSwap Team

---
This email was sent to ${email} because you signed up for SofiSwap updates.
Unsubscribe: ${emailBaseUrl}/unsubscribe?email=${encodeURIComponent(email)}
Privacy Policy: ${emailBaseUrl}/privacy
Terms of Service: ${emailBaseUrl}/terms

© ${new Date().getFullYear()} The Social Proof Foundation, LLC. All rights reserved.
    `.trim()
    
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'brandon@sofiswap.xyz',
      to: email,
      subject: 'Welcome to SofiSwap - The fastest SocialFi + DataFi DEX',
      html: emailHtml,
      text: emailText
    })

    if (error) {
      console.error('Resend email API error:', error)
      return NextResponse.json(
        { success: false, message: 'Failed to send welcome email' },
        { status: 500 }
      )
    }

    console.log('✅ Welcome email sent successfully:', data?.id)

    return NextResponse.json({
      success: true,
      message: 'Welcome email sent successfully!',
      messageId: data?.id,
      contactAdded: contactResult.success,
      contactMessage: contactResult.message
    })

  } catch (error) {
    // Log the cause server-side only; the response stays a stable, non-enumerating message.
    console.error('Welcome email API error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to send welcome email' },
      { status: 500 }
    )
  }
}