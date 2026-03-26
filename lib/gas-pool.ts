/**
 * Gas Pool API utilities for sponsored transactions
 * Handles gas reservation and sponsored transaction execution
 */

// Gas pool API configuration - using local API routes to avoid CORS
const GAS_POOL_RESERVE_URL = '/api/gas-pool/reserve'
const GAS_POOL_EXECUTE_URL = '/api/gas-pool/execute'

// Gas pool API types
export interface GasReservationRequest {
  gas_budget: number
  reserve_duration_secs: number
}

export interface GasReservationResponse {
  result: {
    sponsor_address: string
    reservation_id: number
    gas_coins: Array<{
      objectId: string
      version: number
      digest: string
    }>
  }
  error: null | string
}

export interface ExecuteTransactionRequest {
  reservation_id: number
  tx_bytes: string
  user_sig: string
}

export interface ExecuteTransactionResponse {
  result: {
    digest: string
    effects: any
    events: any[]
  }
  error: null | string
}

/**
 * Reserve gas for a sponsored transaction
 * Note: The gasBudget here is only used to reserve enough coins from the gas pool.
 * The actual transaction will NOT enforce this budget - the SDK calculates the minimum gas needed automatically
 * since we don't call tx.setGasBudget() on the transaction.
 */
export async function reserveGas(
  gasBudget: number = 10_000_000, // 0.01 MySo default - sufficient for most transactions
  reserveDurationSecs: number = 420
): Promise<GasReservationResponse> {
  try {
    console.log('🛢️ Reserving gas for sponsored transaction...', {
      gasBudget,
      reserveDurationSecs,
      note: 'This budget is only for reserving coins - transaction will use SDK-calculated minimum'
    })

    // Always include gas_budget since backend requires it
    const requestBody = {
      gas_budget: gasBudget,
      reserve_duration_secs: reserveDurationSecs
    }

    const response = await fetch(GAS_POOL_RESERVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Gas reservation failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`Gas reservation failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data: GasReservationResponse = await response.json()
    
    if (data.error) {
      console.error('❌ Gas reservation API error:', data.error)
      throw new Error(`Gas reservation API error: ${data.error}`)
    }

    console.log('✅ Gas reserved successfully:', {
      reservationId: data.result.reservation_id,
      sponsorAddress: data.result.sponsor_address,
      gasCoinsCount: data.result.gas_coins.length
    })

    return data

  } catch (error) {
    console.error('❌ Failed to reserve gas:', error)
    throw error
  }
}

/**
 * Execute a sponsored transaction using gas pool
 */
export async function executeSponsoredTransaction(
  reservationId: number,
  txBytes: string,
  userSig: string
): Promise<ExecuteTransactionResponse> {
  try {
    console.log('🚀 Executing sponsored transaction...', {
      reservationId,
      txBytesLength: txBytes.length,
      userSigLength: userSig.length
    })

    const response = await fetch(GAS_POOL_EXECUTE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reservation_id: reservationId,
        tx_bytes: txBytes,
        user_sig: userSig
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Sponsored transaction execution failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`Sponsored transaction execution failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data: any = await response.json()
    
    console.log('🔍 Full execute response:', JSON.stringify(data, null, 2))
    
    if (data.error) {
      console.error('❌ Sponsored transaction API error:', data.error)
      throw new Error(`Sponsored transaction API error: ${data.error}`)
    }

    // Check transaction effects status
    // Only throw if status is explicitly 'failure'
    // If status is undefined/null, assume success (transaction may have succeeded but response structure differs)
    const effects = data.result?.effects || data.effects
    const status = effects?.status?.status
    
    console.log('🔍 Transaction effects status:', status)
    console.log('🔍 Full response structure:', {
      hasResult: !!data.result,
      hasEffects: !!effects,
      resultKeys: data.result ? Object.keys(data.result) : [],
      effectsKeys: effects ? Object.keys(effects) : []
    })
    
    if (status === 'failure') {
      const errorInfo = effects?.status?.error
      console.error('❌ Transaction failed with error:', errorInfo)
      
      // Parse Move abort error code
      let errorMessage = 'Transaction failed'
      if (errorInfo) {
        // Extract error code from MoveAbort format
        const abortMatch = errorInfo.match(/MoveAbort.*?(\d+)\)/)
        if (abortMatch) {
          const errorCode = parseInt(abortMatch[1])
          console.error('❌ Move abort error code:', errorCode)
          
          // Map error codes to user-friendly messages
          const errorMessages: Record<number, string> = {
            21: 'Trading is currently disabled. Please contact support or wait for trading to be enabled.',
            2: 'A reservation pool already exists for this profile.',
            0: 'You are not authorized to perform this action.',
            7: 'Invalid profile ID provided.',
          }
          
          errorMessage = errorMessages[errorCode] || `Transaction failed with error code ${errorCode}. Please try again or contact support.`
        } else {
          errorMessage = `Transaction failed: ${errorInfo}`
        }
      }
      
      throw new Error(errorMessage)
    }

    // If status is not 'failure', assume success (even if status is undefined)
    // The transaction may have succeeded but the response structure might differ
    const digest = data.result?.digest || (data as any).digest
    console.log('✅ Sponsored transaction executed successfully:', {
      digest: digest,
      effectsStatus: status || 'unknown (assuming success)'
    })

    return data

  } catch (error) {
    console.error('❌ Failed to execute sponsored transaction:', error)
    throw error
  }
}

/**
 * Check gas pool health
 */
export async function checkGasPoolHealth(): Promise<boolean> {
  try {
    // Test the reserve endpoint with minimal parameters
    const response = await fetch(GAS_POOL_RESERVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gas_budget: 1000000, // Minimal gas budget for health check
        reserve_duration_secs: 60 // Short duration for health check
      })
    })

    if (!response.ok) {
      console.warn('⚠️ Gas pool health check failed:', response.status)
      return false
    }

    const data = await response.json()
    console.log('✅ Gas pool health check passed:', data)
    return true

  } catch (error) {
    console.warn('⚠️ Gas pool health check error:', error)
    return false
  }
}
