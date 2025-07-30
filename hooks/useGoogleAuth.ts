'use client'

import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { Ed25519Keypair } from '@socialproof/mys/keypairs/ed25519'
import { Transaction } from '@socialproof/mys/transactions'
import { getMysClient } from '@/lib/myso-client'

// JWT Payload interface
interface JwtPayload {
  iss?: string
  sub?: string
  aud?: string[] | string
  exp?: number
  nbf?: number
  iat?: number
  jti?: string
  name?: string
  email?: string
  picture?: string
  given_name?: string
  family_name?: string
}

const JWT_KEY = 'google_auth_jwt'
const PRIVATE_KEY_KEY = 'google_auth_private_key_'
const USER_SALT_KEY = 'google_auth_user_salt'

export function useGoogleAuth() {
  const [address, setAddress] = useState<string | null>(null)
  const [jwt, setJwt] = useState<string | null>(null)
  const [keypair, setKeypair] = useState<Ed25519Keypair | null>(null)
  const [isSubmittingTx, setIsSubmittingTx] = useState(false)
  const [userInfo, setUserInfo] = useState<{
    name?: string
    email?: string
    picture?: string
    given_name?: string
    family_name?: string
  } | null>(null)
  
  // Track if JWT processing is currently in progress to prevent race conditions
  const isProcessingJwtRef = useRef(false)

  // Check for existing login on mount
  useEffect(() => {
    const savedJwt = localStorage.getItem(JWT_KEY)
    if (savedJwt) {
      setJwt(savedJwt)
    }

    // Also check for imported wallet (private key)
    const importedPrivateKey = localStorage.getItem(`${PRIVATE_KEY_KEY}imported`)
    if (importedPrivateKey && !savedJwt) {
      try {
        // Restore imported wallet with private key
        const keyBytes = new Uint8Array(importedPrivateKey.split(',').map(x => parseInt(x, 10)))
        const keypair = Ed25519Keypair.fromSecretKey(keyBytes)
        const address = keypair.getPublicKey().toMysAddress()
        
        setKeypair(keypair)
        setAddress(address)
        
        console.log('✅ Imported wallet (private key) restored from localStorage:', address)
      } catch (error) {
        console.error('Failed to restore imported wallet:', error)
        // Clean up corrupted data
        localStorage.removeItem(`${PRIVATE_KEY_KEY}imported`)
      }
    }

    // Also check for imported public key (read-only)
    const importedPublicKey = localStorage.getItem(`${PRIVATE_KEY_KEY}imported_public`)
    if (importedPublicKey && !savedJwt && !importedPrivateKey) {
      const restorePublicKey = async () => {
        try {
          // Restore read-only wallet with public key only
          const keyBytes = new Uint8Array(importedPublicKey.split(',').map(x => parseInt(x, 10)))
          const { Ed25519PublicKey } = await import('@socialproof/mys/keypairs/ed25519')
          const publicKey = new Ed25519PublicKey(keyBytes)
          const address = publicKey.toMysAddress()
          
          setKeypair(null) // No private key for signing
          setAddress(address)
          
          console.log('✅ Imported wallet (public key only) restored from localStorage:', address)
          console.log('⚠️ Note: This is read-only - you cannot sign transactions.')
        } catch (error) {
          console.error('Failed to restore imported public key:', error)
          // Clean up corrupted data
          localStorage.removeItem(`${PRIVATE_KEY_KEY}imported_public`)
        }
      }
      restorePublicKey()
    }
  }, [])

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = () => {
      // Check URL hash first (typical for implicit flow)
      const hash = window.location.hash
      if (hash.includes('id_token')) {
        const params = new URLSearchParams(hash.slice(1))
        const token = params.get('id_token')
        if (token) {
          setJwt(token)
          localStorage.setItem(JWT_KEY, token)
          window.location.hash = ''
          window.history.replaceState({}, document.title, window.location.pathname)
          return
        }
      }

      // Check URL query params (backup method)
      const urlParams = new URLSearchParams(window.location.search)
      const token = urlParams.get('id_token')
      if (token) {
        setJwt(token)
        localStorage.setItem(JWT_KEY, token)
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname
        window.history.replaceState({}, document.title, newUrl)
      }
    }

    handleOAuthCallback()
  }, [])

  // Process JWT to generate address and keypair
  useEffect(() => {
    if (!jwt) return
    
    // Prevent multiple simultaneous processing
    if (isProcessingJwtRef.current) {
      console.log('🔄 JWT processing already in progress, skipping duplicate call')
      return
    }
    
    const processJwtToAuth = async () => {
      isProcessingJwtRef.current = true
      try {
        // Extract user info from JWT
        const decodedJwt = JSON.parse(atob(jwt.split('.')[1])) as JwtPayload
        setUserInfo({
          name: decodedJwt.name,
          email: decodedJwt.email,
          picture: decodedJwt.picture,
          given_name: decodedJwt.given_name,
          family_name: decodedJwt.family_name
        })

        // Get or generate salt (keyed by Google user ID for consistent addressing across JWT rotations)
        const googleSub = decodedJwt.sub!
        const userSaltKey = `${USER_SALT_KEY}_${googleSub}`
        let salt = localStorage.getItem(userSaltKey)
        
        if (!salt) {
          try {
            console.log('Fetching salt from MySocial service...')
            
            const saltResponse = await axios.post('https://salt.testnet.mysocial.network/salt', {
              jwt: jwt.trim()
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              timeout: 15000
            })
            
            salt = saltResponse.data?.salt
            if (!salt) {
              throw new Error('Salt service returned invalid response')
            }
            
            localStorage.setItem(userSaltKey, salt)
            console.log('✅ Salt received and stored from MySocial service for user:', googleSub)
            
          } catch (saltError) {
            // Generate deterministic fallback salt from JWT subject
            const sub = decodedJwt.sub
            if (!sub) {
              throw new Error('No subject ID found in JWT for fallback salt generation')
            }
            
            const numericSub = String(sub).replace(/\D/g, '') || '12345'
            const paddedSub = numericSub.padEnd(39, '0').slice(0, 39)
            const saltBigInt = BigInt(paddedSub)
            salt = saltBigInt.toString()
            localStorage.setItem(userSaltKey, salt)
            console.log('✅ Using fallback salt generated from JWT sub')
          }
        }

        // Generate deterministic Ed25519 keypair from Google sub + salt
        // (googleSub already declared above)
        const combinedSeed = `${googleSub}_${salt}`
        
        // Hash the combined seed to create entropy for keypair generation
        const encoder = new TextEncoder()
        const data = encoder.encode(combinedSeed)
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
        const hashArray = new Uint8Array(hashBuffer)
        
        // Create Ed25519 keypair from the hash (first 32 bytes as seed)
        const seed = hashArray.slice(0, 32)
        const keypair = Ed25519Keypair.fromSecretKey(seed)
        
        // Get MySocial address
        const address = keypair.getPublicKey().toMysAddress()
        
        setKeypair(keypair)
        setAddress(address)
        
        // Store private key for this user (indexed by Google sub for uniqueness)
        const privateKeyKey = `${PRIVATE_KEY_KEY}${googleSub}`
        localStorage.setItem(privateKeyKey, keypair.getSecretKey())
        

        
        console.log('✅ Google Auth login successful!: ', address)
      } catch (error) {
        console.error('Failed to process JWT for authentication:', error)
      } finally {
        isProcessingJwtRef.current = false
      }
    }

    processJwtToAuth()
  }, [jwt])

  const signInWithGoogle = () => {
    const redirectUri = typeof window !== 'undefined' 
      ? `${window.location.origin}/`
      : (process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || 'http://localhost:3000/')

    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid profile email',
      nonce: Math.random().toString(36).substring(2),
    })
    
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  const submitTransaction = async () => {
    if (!keypair || !address) {
      throw new Error('No keypair or address available')
    }

    setIsSubmittingTx(true)
    try {
      const client = getMysClient()
      
      // Create a simple test transaction
      const txb = new Transaction()
      txb.setSender(address)
      
      // Split coins and transfer (test transaction)
      const [coin] = txb.splitCoins(txb.gas, [BigInt(1000)])
      txb.transferObjects([coin], "0x14f543ec93eb800e916bcb9a6873036707a61fc7f89e5a538295ba8e8c060d52")

      // Sign and execute transaction
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showBalanceChanges: true,
        },
      })

      console.log('✅ Transaction successful:', result.digest)
      return result

    } catch (error) {
      console.error('Transaction failed:', error)
      throw error
    } finally {
      setIsSubmittingTx(false)
    }
  }

  const signOut = () => {
    console.log('🚨 useGoogleAuth.signOut() called - this should NOT happen during imported wallet flow!')
    console.trace('🚨 Call stack for Google signOut:')
    
    // Clear state
    setAddress(null)
    setJwt(null)
    setKeypair(null)
    setUserInfo(null)
    
    // Clear localStorage - including all user-specific salts to prevent cross-contamination
    localStorage.removeItem(JWT_KEY)
    
    // Clear all user-specific data (salts, private keys, public keys)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(PRIVATE_KEY_KEY) || key.startsWith(USER_SALT_KEY)) {
        console.log('🚨 Removing Google auth key:', key)
        localStorage.removeItem(key)
      }
    })
    
    console.log('🚨 Google Auth session cleared - ready for new user login')
  }

  return { 
    address, 
    userInfo,
    keypair,
    signInWithGoogle, 
    signOut,
    submitTransaction,
    isSubmittingTx,
    jwt,
  }
} 