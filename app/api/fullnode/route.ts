export async function POST(request: Request) {
    try {
      const body = await request.json()
      
      // Use HTTP for MySocial testnet to avoid SSL issues
      const mysocialFullnode = process.env.NEXT_PUBLIC_MYS_FULLNODE || 'http://fullnode.testnet.mysocial.network:9000'
      
      console.log('🔍 [Fullnode Proxy] Request Details:')
      console.log('  Target:', mysocialFullnode)
      console.log('  Method:', body.method)
      console.log('  Params count:', body.params?.length || 0)
      
      // Log specific details for executeTransactionBlock
      if (body.method === 'mys_executeTransactionBlock') {
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
        body: JSON.stringify(body)
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
      
      const data = await response.json()
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