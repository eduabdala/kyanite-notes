export interface Env {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  /** lista de origens permitidas, separadas por vírgula */
  ALLOWED_ORIGINS: string
}

function corsHeaders(requestOrigin: string | null, allowedOrigins: string): HeadersInit {
  const allowed = allowedOrigins.split(',').map((o) => o.trim())
  const origin = requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : allowed[0]
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers })
    }

    let code: string | undefined
    try {
      const body = await request.json<{ code?: string }>()
      code = body.code
    } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (!code) {
      return new Response(JSON.stringify({ error: 'Campo "code" é obrigatório' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })

    const data = await tokenRes.json<{
      access_token?: string
      error?: string
      error_description?: string
    }>()

    if (!data.access_token) {
      return new Response(
        JSON.stringify({ error: data.error_description || data.error || 'Falha ao obter token' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ access_token: data.access_token }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  },
}
