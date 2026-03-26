import {
  getCurrentNetworkFromCookies,
  getFullnodeJsonRpcUrl,
} from '@/lib/network-utils';

// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout for blockchain requests

export async function POST(request: Request) {
    try {
      // Parse request body with error handling
      let body;
      try {
        body = await request.json()
      } catch (parseError) {
        console.error('❌ [Fullnode Proxy] Failed to parse request body:', parseError)
        return Response.json(
          { 
            error: 'Invalid request body',
            code: -32700,
            message: 'Parse error'
          },
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          }
        )
      }

      // Validate body structure
      if (!body || typeof body !== 'object') {
        return Response.json(
          { 
            error: 'Invalid request format',
            code: -32600,
            message: 'Invalid Request'
          },
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          }
        )
      }
      
      const cookieHeader = request.headers.get('cookie')
      const network = getCurrentNetworkFromCookies(cookieHeader)
      const mysocialFullnode =
        process.env.NEXT_PUBLIC_MYSO_FULLNODE?.trim() ||
        getFullnodeJsonRpcUrl(network)

      console.log('🔍 [Fullnode Proxy] Request Details:')
      console.log('  Network:', network)
      console.log('  Target:', mysocialFullnode)
      console.log('  Method:', body.method)
      console.log('  Params count:', body.params?.length || 0)
      
      // Log specific details for executeTransactionBlock
      if (
        typeof body.method === 'string' &&
        body.method.includes('executeTransactionBlock')
      ) {
        console.log('🚀 [zkLogin Transaction] Execution Request:')
        console.log('  Param 1 (transactionBlock) type:', typeof body.params[0])
        console.log('  Param 1 length:', body.params[0]?.length || 'unknown')
        console.log('  Param 2 (signatures) type:', typeof body.params[1])
        console.log('  Param 2 length:', body.params[1]?.length || 'unknown')
        console.log('  Param 2 content:', body.params[1])
        console.log('  Param 3 (options):', body.params[2])
        console.log('  Param 4 (requestType):', body.params[3])
      }
      
      console.log('Request body:', JSON.stringify(body, null, 2))
      
      const response = await fetch(mysocialFullnode, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      
      console.log('🔍 [Fullnode Proxy] Response status:', response.status)
      console.log('🔍 [Fullnode Proxy] Response headers:', Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [Fullnode Proxy] HTTP Error Response:')
        console.error('  Status:', response.status)
        console.error('  Status Text:', response.statusText)
        console.error('  Headers:', Object.fromEntries(response.headers.entries()))
        console.error('  Body:', errorText)
        throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`)
      }
      
      // Parse response JSON with error handling
      let data;
      try {
        const responseText = await response.text()
        if (!responseText) {
          throw new Error('Empty response body')
        }
        data = JSON.parse(responseText)
      } catch (parseError) {
        console.error('❌ [Fullnode Proxy] Failed to parse response JSON:', parseError)
        return Response.json(
          { 
            error: 'Invalid JSON response from fullnode',
            code: -32700,
            message: 'Parse error'
          },
          { 
            status: 502,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          }
        )
      }
      
      console.log('✅ [Fullnode Proxy] Success response data:', JSON.stringify(data, null, 2))
      
      // Check for JSON-RPC errors in successful HTTP responses
      if (data.error) {
        console.error('❌ [Fullnode Proxy] JSON-RPC Error in response:')
        console.error('  Error code:', data.error.code)
        console.error('  Error message:', data.error.message)
        console.error('  Error data:', data.error.data)
        console.error('  Full error object:', JSON.stringify(data.error, null, 2))
      }
      
      return Response.json(data, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    } catch (error: any) {
      console.error('❌ [Fullnode Proxy] Exception occurred:')
      console.error('  Error message:', error?.message)
      console.error('  Error code:', error?.code)
      console.error('  Error cause:', error?.cause)
      console.error('  Error stack:', error?.stack)
      console.error('  Full error object:', error)
      console.error('  Error stringified:', JSON.stringify(error, null, 2))
      
      return Response.json(
        { 
          error: 'Fullnode proxy request failed', 
          details: String(error),
          fullError: {
            message: error?.message,
            code: error?.code,
            cause: error?.cause,
            stack: error?.stack
          }
        },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      )
    }
  }
  
  export async function OPTIONS() {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } 