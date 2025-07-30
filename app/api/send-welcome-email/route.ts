import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { addContactToResend, type ResendContact } from '@/lib/resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Environment variables needed:
// RESEND_API_KEY - Your Resend API key
// RESEND_AUDIENCE_ID - Your Resend audience ID for the general mailing list
// RESEND_FROM_EMAIL - The from email address (defaults to brandon@sofiswap.xyz)

export async function POST(request: NextRequest) {
  try {
    const { email, firstName, lastName } = await request.json()

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      )
    }

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
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'brandon@sofiswap.xyz',
      to: email,
      subject: 'Welcome to MySocial - Get Started Today!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to MySocial</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">Welcome to MySocial!</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hello ${firstName || 'there'}!</h2>
            
            <p>Thank you for joining MySocial. We're thrilled to have you as part of our growing community!</p>
            
            <p><strong>What's next?</strong></p>
            <ul>
              <li>Complete your profile to connect with others</li>
              <li>Explore the MySocial ecosystem</li>
              <li>Start building your decentralized social presence</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://mysocial.network'}/wallet" 
                 style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Get Started Now
              </a>
            </div>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
            
            <p>Best regards,<br>
            <strong>The MySocial Team</strong></p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666;">
              This email was sent to ${email} because you signed up for MySocial.<br>
              <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://mysocial.network'}/unsubscribe?email=${encodeURIComponent(email)}" 
                 style="color: #667eea;">Unsubscribe</a> | 
              <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://mysocial.network'}/privacy" 
                 style="color: #667eea;">Privacy Policy</a>
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to MySocial, ${firstName || 'there'}!

Thank you for joining MySocial. We're thrilled to have you as part of our growing community!

What's next?
- Complete your profile to connect with others
- Explore the MySocial ecosystem  
- Start building your decentralized social presence

Get started: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://mysocial.network'}/wallet

If you have any questions, feel free to reach out to our support team.

Best regards,
The MySocial Team

---
This email was sent to ${email} because you signed up for MySocial.
Unsubscribe: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://mysocial.network'}/unsubscribe?email=${encodeURIComponent(email)}
Privacy Policy: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://mysocial.network'}/privacy
      `
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
    console.error('Welcome email API error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to send welcome email' },
      { status: 500 }
    )
  }
}