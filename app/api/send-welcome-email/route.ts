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
      subject: 'Thanks for joining SofiSwap!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to SofiSwap</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            @font-face {
              font-family: 'Satoshi';
              src: url('https://fonts.cdnfonts.com/css/satoshi') format('woff2');
              font-weight: 300 900;
              font-display: swap;
            }
          </style>
        </head>
        <body style="font-family: 'Satoshi', 'Inter', system-ui, -apple-system, sans-serif; line-height: 1.6; color: #2C302E; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fffe;">
          <!-- Header with SofiSwap Brand Colors -->
          <div style="padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 700; font-family: 'Satoshi', 'Inter', sans-serif;">SofiSwap</h1>
            <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.8; font-weight: 500;">The future of SocialFi + InfoFi is here</p>
          </div>
          
          <!-- Main Content -->
          <div style="background: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
            <h2 style="color: #2C302E; margin-top: 0; font-size: 20px; font-weight: 600; font-family: 'Satoshi', 'Inter', sans-serif;">Hello ${firstName || ''}!</h2>
            
            <p style="color: #2C302E; font-size: 14px; margin-bottom: 20px; line-height: 1.5;">Thank you for joining SofiSwap. We're thrilled to have you as part of our growing community!</p>
            <p style="color: #2C302E; font-size: 14px; line-height: 1.5;">If you have any questions, feel free to reach out to our team on Telegram or follow us on X (Twitter) for the latest updates.</p>
            
            <p style="color: #2C302E; font-size: 14px; margin-bottom: 32px; line-height: 1.5;">Best regards,<br>
            <strong style="color: #537A5A; font-family: 'Satoshi', 'Inter', sans-serif;">The SofiSwap Team</strong></p>
            
            <!-- Footer -->
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
            
            <div style="text-align: center; font-size: 12px; color: #909590; line-height: 1.4;">
              <p style="margin: 0 0 8px 0;">This email was sent to ${email} because you signed up for SofiSwap.</p>
              <p style="margin: 0;">
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://sofiswap.xyz'}/unsubscribe?email=${encodeURIComponent(email)}" 
                   style="color: #537A5A; text-decoration: none;">Unsubscribe</a> | 
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://sofiswap.xyz'}/privacy" 
                   style="color: #537A5A; text-decoration: none;">Privacy Policy</a>
              </p>
              <p style="margin: 16px 0 0 0; font-size: 11px;">
                <strong style="color: #2C302E;">The Social Proof Foundation, LLC.</strong><br>
                © ${new Date().getFullYear()} SofiSwap. All Rights Reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to SofiSwap, ${firstName || 'there'}!

        Thank you for joining SofiSwap. We're thrilled to have you as part of our growing community!
        We're working hard to launch SofiSwap and we'll be in touch with you soon with more details.  

        Join our community: https://t.me/sofiswap_xyz

        If you have any questions, feel free to reach out to our team on Telegram or follow us on X (Twitter) for the latest updates.

        Best regards,
        The SofiSwap Team

        ---
        This email was sent to ${email} because you signed up for SofiSwap.
        Unsubscribe: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://sofiswap.xyz'}/unsubscribe?email=${encodeURIComponent(email)}
        Privacy Policy: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://sofiswap.xyz'}/privacy

        The Social Proof Foundation, LLC.
        © ${new Date().getFullYear()} SofiSwap. All Rights Reserved.
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