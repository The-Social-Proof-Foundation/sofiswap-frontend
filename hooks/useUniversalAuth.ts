'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useGoogleAuth } from './useGoogleAuth'
import { MySocialProfile, fetchMySocialProfile } from '@/lib/profile-utils'
import { generateProfileFromGoogleData } from '@/lib/profile-utils'
import { Ed25519Keypair } from '@socialproof/mys/keypairs/ed25519'
import { Transaction } from '@socialproof/mys/transactions'
import { getMysClient } from '@/lib/myso-client'
import { fromB64 } from '@socialproof/mys/utils'
import * as bip39 from 'bip39'
import { processGoogleAuthUser } from '@/lib/resend'

// Auth method type - added 'base' for Base network wallet connections and 'imported' for imported wallets
type AuthMethod = 'google' | 'imported' | 'base' | 'wallet' | null

// Universal auth state
interface UniversalAuthState {
  // Auth method and user info
  authMethod: AuthMethod
  isAuthenticated: boolean
  address: string | null
  profile: MySocialProfile | null
  
  // Loading states
  isLoadingProfile: boolean
  isCheckingProfile: boolean
  
  // Google-specific data (only when using Google OAuth)
  googleUserInfo: any
  
  // Keypair for transaction signing (imported wallets)
  keypair: Ed25519Keypair | null
  
  // Profile management
  hasProfile: boolean
  needsProfileCreation: boolean
  
  // Wallet import functionality
  importWalletFromMnemonic: (mnemonic: string) => Promise<void>
  importWalletFromPrivateKey: (privateKey: string) => Promise<void>
  
  // Wallet creation functionality
  generateNewWallet: () => Promise<{ address: string; mnemonic: string }>
  
  // Actions
  signOut: () => void
  refreshProfile: () => Promise<void>
  checkProfileExists: (address: string) => Promise<boolean>
  getGoogleProfileData: () => any | null
}

// MySocial indexing API
const SOCIAL_INDEX_API = 'https://mys-social-indexer-testnet.up.railway.app'

// Base network chain ID
const BASE_CHAIN_ID = 8453

// Cache key for profile data
const PROFILE_CACHE_KEY = 'mysocial_profile_'

export function useUniversalAuth(): UniversalAuthState {
  const [profile, setProfile] = useState<MySocialProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [isCheckingProfile, setIsCheckingProfile] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)
  const [needsProfileCreation, setNeedsProfileCreation] = useState(false)
  
  // Imported wallet state
  const [importedAddress, setImportedAddress] = useState<string | null>(null)
  const [importedKeypair, setImportedKeypair] = useState<Ed25519Keypair | null>(null)
  
  // SendGrid tracking for welcome emails
  const isProcessingWelcomeEmail = useRef(false)
  const processedUsers = useRef(new Set<string>())
  
  // Check for existing imported wallet on mount
  useEffect(() => {
    const checkExistingImportedWallet = () => {
      try {
        // Check for mnemonic-based wallet first (new method)
        const storedMnemonic = localStorage.getItem('mysocial_mnemonic')
        const storedPath = localStorage.getItem('mysocial_derivation_path')
        const storedAddress = localStorage.getItem('mysocial_address')
        
        if (storedMnemonic && storedPath && storedAddress) {
          console.log('🔍 Restoring wallet from mnemonic...')
          
          const keypair = Ed25519Keypair.deriveKeypair(storedMnemonic, storedPath)
          const derivedAddress = keypair.getPublicKey().toMysAddress()
          
          // Validate that the mnemonic generates the stored address
          if (derivedAddress !== storedAddress) {
            console.error('🚨 Address mismatch detected!')
            console.error('  Stored address:', storedAddress)
            console.error('  Derived address:', derivedAddress)
            console.error('  Clearing corrupted wallet data...')
            
            // Clear corrupted data
            localStorage.removeItem('mysocial_mnemonic')
            localStorage.removeItem('mysocial_derivation_path')
            localStorage.removeItem('mysocial_address')
            return
          }
          
          setImportedAddress(storedAddress)
          setImportedKeypair(keypair)
          
          console.log('✅ Wallet restored from mnemonic:', storedAddress)
          return
        }
        
        // Fallback: Check for old private key format (legacy method)
        const storedPrivateKey = localStorage.getItem('mysocial_private_key')
        if (storedPrivateKey && storedAddress) {
          console.log('🔍 Restoring wallet from stored private key...')
          
          const keyArray = storedPrivateKey.split(',').map(Number)
          const keyBytes = new Uint8Array(keyArray)
          
          const keypair = Ed25519Keypair.fromSecretKey(keyBytes)
          const derivedAddress = keypair.getPublicKey().toMysAddress()
          
          // Validate that the keypair matches the stored address
          if (derivedAddress !== storedAddress) {
            console.error('🚨 Legacy key address mismatch detected!')
            console.error('  Stored address:', storedAddress)
            console.error('  Keypair address:', derivedAddress)
            console.error('  Clearing corrupted wallet data...')
            
            // Clear corrupted data
            localStorage.removeItem('mysocial_private_key')
            localStorage.removeItem('mysocial_address')
            return
          }
          
          setImportedAddress(storedAddress)
          setImportedKeypair(keypair)
          
          console.log('✅ Legacy wallet restored:', storedAddress)
        }
      } catch (error) {
        console.error('Error restoring imported wallet:', error)
        // Clear all corrupted data
        localStorage.removeItem('mysocial_private_key')
        localStorage.removeItem('mysocial_mnemonic')
        localStorage.removeItem('mysocial_derivation_path')
        localStorage.removeItem('mysocial_address')
      }
    }
    
    checkExistingImportedWallet()
  }, [])

  // Google Auth state (simple and clean)
  const { 
    address: googleAddress, 
    userInfo: googleUserInfo,
    keypair: googleKeypair,
    signOut: signOutGoogle
  } = useGoogleAuth()

  // Memoized auth method detection (prevents re-calculation on every render)
  const authMethod: AuthMethod = useMemo(() => {
    if (googleAddress && googleUserInfo) {
      return 'google' // Actual Google OAuth
    } else if (importedAddress) {
      return 'imported' // Imported wallet (mnemonic/private key)
    } else {
      return 'wallet' // Other wallet
    }
  }, [googleAddress, googleUserInfo, importedAddress])
  
  // Memoized current address calculation
  const currentAddress = useMemo(() => {
    return googleAddress || importedAddress || null
  }, [googleAddress, importedAddress])
  
  // Memoized current keypair calculation - prioritize Google auth, then imported wallet
  const currentKeypair = useMemo(() => {
    if (googleKeypair) return googleKeypair
    if (importedKeypair) return importedKeypair
    return null // No keypair for external wallet connections
  }, [googleKeypair, importedKeypair])
  
  const isAuthenticated = !!currentAddress

  // Fetch user profile from MySocial indexing server (with caching)
  const fetchProfile = async (address: string): Promise<MySocialProfile | null> => {
    try {
      setIsLoadingProfile(true)
      
      // Check cache first
      const cacheKey = `${PROFILE_CACHE_KEY}${address}`
      const cachedProfile = localStorage.getItem(cacheKey)
      if (cachedProfile) {
        try {
          const profileData = JSON.parse(cachedProfile)
          return profileData
        } catch (parseError) {
          console.warn('Cache parse error, fetching fresh:', parseError)
          localStorage.removeItem(cacheKey)
        }
      }

      // Cache miss - fetch from API
      const profileData = await fetchMySocialProfile(address)
      
      if (profileData) {
        // Cache the successful result
        localStorage.setItem(cacheKey, JSON.stringify(profileData))
      }
      
      return profileData
      
    } catch (error) {
      console.error('Error fetching MySocial profile:', error)
      return null
    } finally {
      setIsLoadingProfile(false)
    }
  }

  // Check if profile exists for address
  const checkProfileExists = async (address: string): Promise<boolean> => {
    try {
      setIsCheckingProfile(true)
      
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
    } finally {
      setIsCheckingProfile(false)
    }
  }

  // Refresh current user profile
  const refreshProfile = async (): Promise<void> => {
    if (!currentAddress) return

    const profileData = await fetchProfile(currentAddress)
    const profileExists = !!profileData
    
    setProfile(profileData)
    setHasProfile(profileExists)
    setNeedsProfileCreation(!profileExists && isAuthenticated)
  }

  // Universal sign out
  const signOut = () => {
    // Clear profile state
    setProfile(null)
    setHasProfile(false)
    setNeedsProfileCreation(false)
    
    // Clear cached profile data
    if (currentAddress) {
      const cacheKey = `${PROFILE_CACHE_KEY}${currentAddress}`
      localStorage.removeItem(cacheKey)
    }
    
    // Clear welcome email tracking for this user
    if (authMethod === 'google' && googleUserInfo) {
      const userIdentifier = googleUserInfo.email || currentAddress
      const welcomeEmailKey = `mysocial_welcome_email_sent_${userIdentifier}`
      localStorage.removeItem(welcomeEmailKey)
      if (userIdentifier) {
        processedUsers.current.delete(userIdentifier)
      }
    }
    
    // Sign out from Google if authenticated with Google OAuth
    if (authMethod === 'google') {
      signOutGoogle()
    }
    
    // Sign out from imported wallet (mnemonic/private key)
    if (authMethod === 'imported') {
      localStorage.removeItem('mysocial_private_key') // legacy
      localStorage.removeItem('mysocial_mnemonic')
      localStorage.removeItem('mysocial_derivation_path')
      localStorage.removeItem('mysocial_address')
      setImportedAddress(null)
      setImportedKeypair(null)
    }
    
    console.log('✅ Signed out')
  }

  // Get pre-populated profile data from Google info (for /create page later)
  const getGoogleProfileData = () => {
    if (authMethod === 'google' && currentAddress && googleUserInfo) {
      return generateProfileFromGoogleData(currentAddress, googleUserInfo)
    }
    return null
  }

  // Effect: Handle authentication and profile loading (consolidated)
  useEffect(() => {
    if (currentAddress && isAuthenticated) {
      refreshProfile()
    } else {
      // Clear profile state when not authenticated
      setProfile(null)
      setHasProfile(false)
      setNeedsProfileCreation(false)
    }
  }, [currentAddress, isAuthenticated, authMethod])

  // Effect: Handle welcome email for Google Auth users (single call after successful auth)
  useEffect(() => {
    const handleWelcomeEmail = async () => {
      // Only process Google Auth users with valid data
      if (authMethod !== 'google' || !googleUserInfo || !currentAddress) {
        return
      }

      // Prevent multiple simultaneous processing
      if (isProcessingWelcomeEmail.current) {
        return
      }

      // Create unique identifier for this user (use email or address)
      const userIdentifier = googleUserInfo.email || currentAddress
      
      // Skip if already processed this user
      if (processedUsers.current.has(userIdentifier)) {
        return
      }

      // Check localStorage for previous welcome email tracking
      const welcomeEmailKey = `mysocial_welcome_email_sent_${userIdentifier}`
      if (localStorage.getItem(welcomeEmailKey)) {
        processedUsers.current.add(userIdentifier)
        return
      }

      // Ensure we have email before proceeding
      if (!googleUserInfo.email) {
        console.warn('⚠️ No email found in Google user info, skipping welcome email')
        return
      }

      // Process welcome email for new Google Auth user
      isProcessingWelcomeEmail.current = true

      try {
        const result = await processGoogleAuthUser(
          googleUserInfo.email,
          googleUserInfo.given_name,
          googleUserInfo.family_name
        )

        if (result.emailSent.success) {
          // Mark as completed to prevent future attempts
          localStorage.setItem(welcomeEmailKey, new Date().toISOString())
          processedUsers.current.add(userIdentifier)
          
          if (result.emailSent.message === 'Welcome email skipped - user already welcomed') {
            console.log('ℹ️ User already welcomed, skipping duplicate email')
          } else {
            console.log('✅ Welcome email sent.')
          }
        } else {
          console.warn('⚠️ Welcome email failed:', result.emailSent.message)
        }

        // Contact addition is optional - log only if failed
        if (!result.contactAdded.success) {
          console.log('ℹ️ Contact list subscription skipped (optional feature)')
        }

      } catch (error) {
        console.error('❌ Welcome email processing error:', error)
      } finally {
        isProcessingWelcomeEmail.current = false
      }
    }

    handleWelcomeEmail()
  }, [authMethod, googleUserInfo, currentAddress])

  // Import wallet from mnemonic phrase
  const importWalletFromMnemonic = async (mnemonic: string) => {
    try {
      console.log('🔄 Importing wallet from mnemonic...')
      
      // Validate mnemonic (basic check for 12-24 words)
      const words = mnemonic.trim().split(/\s+/)
      if (words.length < 12 || words.length > 24) {
        throw new Error('Invalid mnemonic: must be 12-24 words')
      }
      
      // Check if Ed25519Keypair has a deriveKeypair method
      if (typeof Ed25519Keypair.deriveKeypair === 'function') {
        const derivationPath = "m/44'/784'/0'/0'/0'"
        const keypair = Ed25519Keypair.deriveKeypair(mnemonic, derivationPath)
        const address = keypair.getPublicKey().toMysAddress()
        
        // Store the mnemonic and derivation path instead of trying to extract secret key bytes
        localStorage.setItem('mysocial_mnemonic', mnemonic)
        localStorage.setItem('mysocial_derivation_path', derivationPath)
        localStorage.setItem('mysocial_address', address)
        
        // Verify we can restore the same address using the stored mnemonic
        const restoredKeypair = Ed25519Keypair.deriveKeypair(mnemonic, derivationPath)
        const restoredAddress = restoredKeypair.getPublicKey().toMysAddress()
        if (address !== restoredAddress) {
          throw new Error('Mnemonic import validation failed: stored mnemonic cannot restore same address')
        }
        
        setImportedAddress(address)
        setImportedKeypair(keypair)
        
        console.log('✅ Wallet imported from mnemonic:', address)
        console.log('✅ Mnemonic validation passed: can restore same address')
      } else {
        throw new Error('Ed25519Keypair.deriveKeypair method not available')
      }
    } catch (error: any) {
      console.error('Wallet import from mnemonic failed:', error)
      throw error
    }
  }
  
  // Import wallet from private key
  const importWalletFromPrivateKey = async (privateKey: string) => {
    try {
      console.log('🔄 Importing wallet from private key...')
      
      let keyBytes: Uint8Array
      
      if (privateKey.startsWith('0x')) {
        // Hex format
        const hex = privateKey.slice(2)
        if (hex.length !== 64) {
          throw new Error('Invalid private key: hex key must be 64 characters (32 bytes)')
        }
        keyBytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
      } else {
        // Assume comma-separated array format
        const keyArray = privateKey.split(',').map(Number)
        if (keyArray.length !== 32) {
          throw new Error('Invalid private key: must be 32 bytes')
        }
        keyBytes = new Uint8Array(keyArray)
      }
      
      const keypair = Ed25519Keypair.fromSecretKey(keyBytes)
      const address = keypair.getPublicKey().toMysAddress()
      
      // Store in localStorage and state (ensure exactly 32 bytes)
      let privateKeyBytes: Uint8Array
      if (keyBytes.length === 32) {
        privateKeyBytes = keyBytes
      } else if (keyBytes.length > 32) {
        privateKeyBytes = keyBytes.slice(0, 32) as Uint8Array
      } else {
        throw new Error(`Invalid private key length: ${keyBytes.length} bytes (expected 32)`)
      }
      
      const privateKeyArray = Array.from(privateKeyBytes).join(',')
      localStorage.setItem('mysocial_private_key', privateKeyArray)
      localStorage.setItem('mysocial_address', address)
      
      setImportedAddress(address)
      setImportedKeypair(keypair)
      
      console.log('✅ Wallet imported from private key:', address)
    } catch (error: any) {
      console.error('Wallet import from private key failed:', error)
      throw error
    }
  }

  // Generate new wallet with mnemonic
  const generateNewWallet = async (): Promise<{ address: string; mnemonic: string }> => {
    try {
      console.log('🔄 Generating new wallet...')
      
      // Generate 12-word mnemonic using BIP39
      const mnemonic = bip39.generateMnemonic(128) // 128 bits = 12 words
      
      // Validate generated mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Generated mnemonic is invalid')
      }
      
      // Check if Ed25519Keypair has a deriveKeypair method
      if (typeof Ed25519Keypair.deriveKeypair === 'function') {
        const keypair = Ed25519Keypair.deriveKeypair(mnemonic, "m/44'/784'/0'/0'/0'")
        const address = keypair.getPublicKey().toMysAddress()
        
        // Store the mnemonic and derivation path instead of trying to extract secret key bytes
        // This follows the standard Ed25519 derivation pattern from the documentation
        const derivationPath = "m/44'/784'/0'/0'/0'"
        
        localStorage.setItem('mysocial_mnemonic', mnemonic)
        localStorage.setItem('mysocial_derivation_path', derivationPath)
        localStorage.setItem('mysocial_address', address)
        
        // Verify we can restore the same address using the stored mnemonic
        const restoredKeypair = Ed25519Keypair.deriveKeypair(mnemonic, derivationPath)
        const restoredAddress = restoredKeypair.getPublicKey().toMysAddress()
        if (address !== restoredAddress) {
          throw new Error('Wallet generation validation failed: stored mnemonic cannot restore same address')
        }
        
        setImportedAddress(address)
        setImportedKeypair(keypair)
        
        console.log('✅ New wallet generated:', address)
        console.log('✅ Generation validation passed: mnemonic restores same address')
        return { address, mnemonic }
      } else {
        throw new Error('Ed25519Keypair.deriveKeypair method not available')
      }
    } catch (error: any) {
      console.error('Wallet generation failed:', error)
      throw error
    }
  }

  return {
    // Auth method and user info
    authMethod,
    isAuthenticated,
    address: currentAddress,
    profile,
    
    // Loading states
    isLoadingProfile,
    isCheckingProfile,
    
    // Google-specific data
    googleUserInfo,
    
    // Keypair for transaction signing (Google auth + imported wallets)
    keypair: currentKeypair,
    
    // Profile management
    hasProfile,
    needsProfileCreation,
    
    // Wallet import functionality
    importWalletFromMnemonic,
    importWalletFromPrivateKey,
    
    // Wallet creation functionality
    generateNewWallet,
    
    // Actions
    signOut,
    refreshProfile,
    checkProfileExists,
    getGoogleProfileData,
  }
} 