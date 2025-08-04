// Resend utilities for email management and transactional emails
// Handles email list management AND sending welcome emails

// Contact management interfaces
export interface ResendContact {
  email: string
  firstName?: string
  lastName?: string
  unsubscribed?: boolean
}

export interface ResendContactResponse {
  success: boolean
  message: string
  contactId?: string
}

// Welcome email interfaces (aligned with WelcomeEmailProps from React Email template)
export interface WelcomeEmailData {
  email: string
  firstName?: string
  lastName?: string
  fullName?: string
  baseUrl?: string
}

export interface ResendEmailResponse {
  success: boolean
  message: string
  messageId?: string
}

// Combined response for both actions
export interface ResendCombinedResponse {
  contactAdded: ResendContactResponse
  emailSent: ResendEmailResponse
  overallSuccess: boolean
}

// Check if a contact exists in Resend audience
export async function checkContactExists(email: string, audienceId?: string): Promise<boolean> {
  try {
    // Check if we have required API key and audience ID
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not configured, assuming contact does not exist')
      return false
    }

    const targetAudienceId = audienceId || process.env.RESEND_AUDIENCE_ID
    if (!targetAudienceId) {
      console.warn('⚠️ No audience ID provided, assuming contact does not exist')
      return false
    }

    // Query Resend API to check if contact exists in audience
    const response = await fetch(`https://api.resend.com/audiences/${targetAudienceId}/contacts/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      }
    })

    if (response.status === 404) {
      // Contact not found
      return false
    }

    if (!response.ok) {
      console.error('❌ Error checking contact existence:', response.status, response.statusText)
      return false
    }

    // Contact exists
    return true
  } catch (error) {
    console.error('❌ Error checking contact existence:', error)
    return false
  }
}

// Add contact to Resend contact list (actual implementation)
export async function addContactToResend(
  contact: ResendContact,
  audienceId?: string
): Promise<ResendContactResponse> {
  try {
    // Check if we have required API key
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not configured, skipping contact addition')
      return {
        success: false,
        message: 'Resend API key not configured'
      }
    }

    // Use default audience ID if not provided
    const targetAudienceId = audienceId || process.env.RESEND_AUDIENCE_ID

    if (!targetAudienceId) {
      console.warn('⚠️ No audience ID provided, skipping contact addition')
      return {
        success: false,
        message: 'No audience ID configured'
      }
    }

    // Call Resend API to add contact to audience
    const response = await fetch(`https://api.resend.com/audiences/${targetAudienceId}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: contact.email,
        first_name: contact.firstName,
        last_name: contact.lastName,
        unsubscribed: contact.unsubscribed || false
      })
    })

    const result = await response.json()

    if (!response.ok) {
      // Handle specific Resend API errors
      if (response.status === 422 && result.message?.includes('already exists')) {
        console.log('📝 Contact already exists in audience:', contact.email)
        return {
          success: true,
          message: 'Already in contact list!',
          contactId: result.id
        }
      }
      
      console.error('❌ Resend API error:', result)
      return {
        success: false,
        message: result.message || 'Failed to add to audience'
      }
    }

    console.log('✅ Contact added to audience:', contact.email, result.id)
    return { 
      success: true, 
      message: 'Successfully added to contact list!',
      contactId: result.id
    }
    
  } catch (error) {
    console.error('❌ Resend contact addition error:', error)
    return { 
      success: false, 
      message: `Failed to add to contact list: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }
  }
}

// Smart contact addition - checks existence first, then adds if needed
export async function smartAddContactToResend(
  contact: ResendContact,
  audienceId?: string
): Promise<ResendContactResponse> {
  try {
    // Check if contact already exists
    const contactExists = await checkContactExists(contact.email)
    
    if (contactExists) {
      return {
        success: true,
        message: 'Already in contact list!'
      }
    }
    
    // Contact doesn't exist, add them
    return await addContactToResend(contact, audienceId)
    
  } catch (error) {
    console.error('Smart contact addition error:', error)
    return {
      success: false,
      message: 'Failed to process contact addition. Please try again.'
    }
  }
}

// Send welcome email using Resend via API route
export async function sendWelcomeEmail(
  emailData: WelcomeEmailData
): Promise<ResendEmailResponse> {
  try {
    const response = await fetch('/api/send-welcome-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: emailData.email,
        firstName: emailData.firstName,
        lastName: emailData.lastName,
        baseUrl: emailData.baseUrl
      })
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || 'Failed to send email')
    }

    return result
    
  } catch (error) {
    console.error('Resend welcome email error:', error)
    return { 
      success: false, 
      message: 'Failed to send welcome email. Please try again.' 
    }
  }
}

// Combined function: Add to contact list AND send welcome email
export async function addContactAndSendWelcomeEmail(
  email: string,
  firstName?: string,
  lastName?: string
): Promise<ResendCombinedResponse> {
  
  // Prepare contact data
  const contact: ResendContact = {
    email,
    firstName,
    lastName
  }

  // Prepare email data
  const emailData: WelcomeEmailData = {
    email,
    firstName,
    lastName,
    fullName: `${firstName || ''} ${lastName || ''}`.trim() || undefined,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://sofiswap.xyz'
  }

  // Use environment variables for audience ID if available
  const audienceId = process.env.RESEND_AUDIENCE_ID

  // Execute contact addition first (optional feature)
  const contactResult = await smartAddContactToResend(contact, audienceId)

  // If user is already in contact list, they've been welcomed before - skip email
  if (contactResult.success && contactResult.message === 'Already in contact list!') {
    return {
      contactAdded: contactResult,
      emailSent: {
        success: true,
        message: 'Welcome email skipped - user already welcomed'
      },
      overallSuccess: true
    }
  }

  // Send welcome email to new contacts only
  const emailResult = await sendWelcomeEmail(emailData)

  // Consider the process successful if at least the email was sent
  // Contact addition is nice-to-have but not critical for user experience
  return {
    contactAdded: contactResult,
    emailSent: emailResult,
    overallSuccess: emailResult.success // Focus on email success as primary goal
  }
}

// Google Auth specific helper - wrapper for the combined function
export async function processGoogleAuthUser(
  email: string,
  firstName?: string,
  lastName?: string
): Promise<ResendCombinedResponse> {
  return await addContactAndSendWelcomeEmail(email, firstName, lastName)
}