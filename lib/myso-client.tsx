import { MysClient } from '@socialproof/mys/client'

// Shared client instance to avoid creating multiple connections
let mysClient: MysClient | null = null

export function getMysClient(): MysClient {
  if (!mysClient) {
    // Use relative URL for production, fallback to localhost for development
    const fullnodeUrl = process.env.NEXT_PUBLIC_MYSO_FULLNODE_URL || 
                       (typeof window !== 'undefined' 
                         ? '/api/fullnode/' 
                         : 'http://localhost:3000/api/fullnode/')
    
    console.log('Creating MySocial client with URL:', fullnodeUrl)
    mysClient = new MysClient({ url: fullnodeUrl })
  }
  
  return mysClient
}

// Function to reset client if needed
export function resetMysClient(): void {
  mysClient = null
} 