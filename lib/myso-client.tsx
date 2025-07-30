import { MysClient } from '@socialproof/mys/client'

// Shared client instance to avoid creating multiple connections
let mysClient: MysClient | null = null

export function getMysClient(): MysClient {
  if (!mysClient) {
    const fullnodeUrl = 'http://localhost:3000/api/fullnode/'
    
    console.log('Creating MySocial client with URL:', fullnodeUrl)
    mysClient = new MysClient({ url: fullnodeUrl })
  }
  
  return mysClient
}

// Function to reset client if needed
export function resetMysClient(): void {
  mysClient = null
} 