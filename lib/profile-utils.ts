import { Ed25519Keypair } from '@socialproof/mys/keypairs/ed25519'

// Profile creation data interface
interface ProfileCreationData {
  address: string
  username?: string
  displayName?: string
  bio?: string
  email?: string
  avatar?: string
  coverImage?: string
}

// MySocial profile interface (from API response)
export interface MySocialProfile {
  id: number
  owner_address: string
  username: string | null
  display_name: string | null
  bio: string | null
  profile_photo: string | null
  website: string | null
  created_at: string
  updated_at: string
  cover_photo: string | null
  profile_id: string
  followers_count: number
  following_count: number
  post_count: number
  min_offer_amount: number | null
  birthdate: string | null
  current_location: string | null
  raised_location: string | null
  phone: string | null
  email: string | null
  gender: string | null
  political_view: string | null
  religion: string | null
  education: string | null
  primary_language: string | null
  relationship_status: string | null
  x_username: string | null
  mastodon_username: string | null
  facebook_username: string | null
  reddit_username: string | null
  github_username: string | null
  block_list_address: string | null
}

// Google user info interface (from useGoogleAuth)
interface GoogleUserInfo {
  name?: string
  email?: string
  picture?: string
  given_name?: string
  family_name?: string
}

// MySocial indexing API endpoints
export const SOCIAL_INDEX_API = 'https://mys-social-indexer-testnet.up.railway.app'

/**
 * Fetch a MySocial profile by address
 */
export async function fetchMySocialProfile(address: string): Promise<MySocialProfile | null> {
  try {
    const response = await fetch(`${SOCIAL_INDEX_API}/profiles/address/${address}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 404) {
      console.log('MySocial profile not found for address:', address)
      return null
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch profile: ${response.statusText}`)
    }

    const profileData = await response.json()
    
    // Check if the response contains an error (API returns {"error":"Profile not found"} with 200 status)
    if (profileData && typeof profileData === 'object' && profileData.error) {
      console.log('MySocial profile not found for address:', address, '- API returned error:', profileData.error)
      return null
    }
    
    console.log('MySocial profile fetched successfully:', profileData)
    return profileData
    
  } catch (error) {
    console.error('Error fetching MySocial profile:', error)
    return null
  }
}

/**
 * Check if a MySocial profile exists for an address
 */
export async function checkMySocialProfileExists(address: string): Promise<boolean> {
  try {
    const response = await fetch(`${SOCIAL_INDEX_API}/profiles/address/${address}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    return response.ok && response.status === 200
    
  } catch (error) {
    console.error('Error checking profile existence:', error)
    return false
  }
}

/**
 * Get display name with proper priority: MySocial → Google → ENS → Address → Fallback
 */
export function getDisplayName(
  mysocialProfile: MySocialProfile | null,
  isLoadingProfile: boolean,
  authMethod: string | null,
  googleUserInfo: any,
  isOwnProfile: boolean,
  ensName: string | undefined,
  displayAddress: string
): string {
  if (isLoadingProfile) {
    return "loading..."
  }
  
  // Priority 1: MySocial profile display_name
  if (mysocialProfile?.display_name) {
    return mysocialProfile.display_name
  }
  
  // Priority 2: Google name (fallback for authenticated user without MySocial profile)
  if (authMethod === 'google' && googleUserInfo?.name && isOwnProfile && !mysocialProfile) {
    return googleUserInfo.name
  }

  // Priority 3: ENS name
  if (ensName) {
    return ensName
  }

  // Priority 4: Truncated address
  if (displayAddress) {
    return `${displayAddress.slice(0, 6)}...${displayAddress.slice(-6)}`
  }

  return ""
}

/**
 * Get bio with proper priority: MySocial → Default
 */
export function getBio(
  mysocialProfile: MySocialProfile | null,
  authMethod: string | null
): string {
  if (mysocialProfile?.bio) {
    return mysocialProfile.bio
  }

  if (authMethod === 'base') {
    return ""
  }

  return ""
}

/**
 * Get cover photo with MySocial priority
 */
export function getCoverPhoto(mysocialProfile: MySocialProfile | null): string {
  if (mysocialProfile?.cover_photo) {
    return mysocialProfile.cover_photo
  }
  return "/default-cover.jpg"
}

/**
 * Create a new user profile on the social indexing server
 */
export async function createProfile(
  profileData: ProfileCreationData,
  keypair?: Ed25519Keypair
): Promise<boolean> {
  try {
    console.log('Creating profile for address:', profileData.address)
    
    // Prepare the request body
    const requestBody = {
      ...profileData,
      // Add signature if keypair is provided for verification
      ...(keypair && {
        signature: await signProfileCreation(profileData, keypair)
      })
    }

    const response = await fetch(`${SOCIAL_INDEX_API}/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create profile: ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    console.log('Profile created successfully:', result)
    return true

  } catch (error) {
    console.error('Error creating profile:', error)
    return false
  }
}

/**
 * Generate profile creation data from Google user info
 */
export function generateProfileFromGoogleData(
  address: string,
  googleUserInfo: GoogleUserInfo
): ProfileCreationData {
  const profileData: ProfileCreationData = {
    address,
    displayName: googleUserInfo.name || googleUserInfo.given_name || 'User',
    email: googleUserInfo.email,
    avatar: googleUserInfo.picture,
    bio: `Welcome to MySocial! I'm ${googleUserInfo.given_name || 'excited'} to be here.`
  }

  // Generate a username suggestion from email or name
  if (googleUserInfo.email) {
    const emailUsername = googleUserInfo.email.split('@')[0]
    profileData.username = generateUsernameFromString(emailUsername)
  } else if (googleUserInfo.name) {
    profileData.username = generateUsernameFromString(googleUserInfo.name)
  }

  return profileData
}

/**
 * Generate a clean username from a string
 */
function generateUsernameFromString(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special characters
    .substring(0, 20) // Limit length
    .replace(/^[0-9]+/, '') // Remove leading numbers
    || 'user' // Fallback
}

/**
 * Sign profile creation data for verification (if needed by backend)
 */
async function signProfileCreation(
  profileData: ProfileCreationData,
  keypair: Ed25519Keypair
): Promise<string> {
  try {
    // Create a message to sign from profile data
    const message = JSON.stringify({
      address: profileData.address,
      username: profileData.username,
      displayName: profileData.displayName,
      timestamp: Date.now()
    })

    // Sign the message with the keypair
    const messageBytes = new TextEncoder().encode(message)
    const signatureResult = await keypair.signPersonalMessage(messageBytes)
    
    // Handle the signature result properly - it might be an object with signature property
    let signatureBytes: Uint8Array
    if (typeof signatureResult === 'object' && 'signature' in signatureResult) {
      signatureBytes = new Uint8Array(Buffer.from(signatureResult.signature, 'base64'))
    } else {
      signatureBytes = new Uint8Array(signatureResult as any)
    }
    
    return Buffer.from(signatureBytes).toString('base64')
  } catch (error) {
    console.error('Error signing profile creation:', error)
    throw error
  }
}

/**
 * Check if username is available
 */
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  try {
    const response = await fetch(`${SOCIAL_INDEX_API}/profiles/username/${username}/availability`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Username availability check failed:', response.statusText)
      return false
    }

    const data = await response.json()
    
    // Check if the response has the expected format
    if (typeof data.available === 'boolean') {
      return data.available
    }
    
    console.error('Unexpected response format:', data)
    return false
    
  } catch (error) {
    console.error('Error checking username availability:', error)
    return false
  }
}

/**
 * Update an existing profile
 */
export async function updateProfile(
  address: string,
  updates: Partial<ProfileCreationData>,
  keypair?: Ed25519Keypair
): Promise<boolean> {
  try {
    console.log('Updating profile for address:', address)
    
    const requestBody = {
      ...updates,
      ...(keypair && {
        signature: await signProfileCreation({ address, ...updates } as ProfileCreationData, keypair)
      })
    }

    const response = await fetch(`${SOCIAL_INDEX_API}/profiles/${address}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to update profile: ${response.statusText} - ${errorText}`)
    }

    console.log('Profile updated successfully')
    return true

  } catch (error) {
    console.error('Error updating profile:', error)
    return false
  }
} 

/**
 * Check if a profile follows another profile
 * @param followerAddress - Address of the potential follower
 * @param followingAddress - Address of the profile being followed
 * @returns Promise<boolean> - true if following, false if not
 */
export async function checkFollowStatus(
  followerAddress: string,
  followingAddress: string
): Promise<boolean> {
  try {
    const response = await fetch(`${SOCIAL_INDEX_API}/social-graph/check/${followerAddress}/${followingAddress}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn('Follow status check failed:', response.statusText)
      return false
    }

    const data = await response.json()
    
    // Handle the response structure: { error?, is_following: boolean }
    if (data.error) {
      console.log('Follow status check - profile not found:', data.error)
      return false
    }
    
    return data.is_following === true
    
  } catch (error) {
    console.error('Error checking follow status:', error)
    return false
  }
}

/**
 * Check if a profile has blocked another profile
 * @param blockerAddress - Address of the potential blocker
 * @param blockedAddress - Address of the profile that might be blocked
 * @returns Promise<boolean> - true if blocked, false if not
 */
export async function checkBlockStatus(
  blockerAddress: string,
  blockedAddress: string
): Promise<boolean> {
  try {
    const response = await fetch(`${SOCIAL_INDEX_API}/blocklist/check/profile/${blockerAddress}/${blockedAddress}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn('Block status check failed:', response.statusText)
      return false
    }

    const data = await response.json()
    
    // Handle the response structure: { error?, is_blocked: boolean }
    if (data.error) {
      console.log('Block status check - profile not found:', data.error)
      return false
    }
    
    return data.is_blocked === true
    
  } catch (error) {
    console.error('Error checking block status:', error)
    return false
  }
} 