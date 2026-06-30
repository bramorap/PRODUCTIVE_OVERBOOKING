const express = require('express')
const axios = require('axios')
const qs = require('qs')
const path = require('path')
require('dotenv').config()

const app = express()
app.use(express.json())

const API_BASE = 'https://api.productive.io/api/v2'

app.all('/api/productive/*', async (req, res) => {
  const apiToken = req.headers['x-auth-token'] || process.env.PRODUCTIVE_API_TOKEN
  const orgId = req.headers['x-org-id'] || process.env.PRODUCTIVE_ORG_ID || '52239'

  if (!apiToken) {
    return res.status(401).json({
      error: 'No API token. Set PRODUCTIVE_API_TOKEN in .env or configure in Settings.',
    })
  }

  const apiPath = req.path.replace('/api/productive', '')
  // Re-serialize query params preserving bracket notation (avoid double-encoding)
  const rawQuery = req.query
  const serializedParams = qs.stringify(rawQuery, { encode: false, arrayFormat: 'brackets' })
  const fullUrl = `${API_BASE}${apiPath}${serializedParams ? '?' + serializedParams : ''}`

  console.log(`→ ${req.method} ${fullUrl}`)

  try {
    const response = await axios({
      method: req.method,
      url: fullUrl,
      headers: {
        'X-Auth-Token': apiToken,
        'X-Organization-Id': orgId,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      ...((['POST', 'PATCH', 'PUT'].includes(req.method)) && { data: req.body }),
    })

    res.status(response.status).json(response.data)
  } catch (err) {
    console.error(`✗ ${err.response?.status}`, JSON.stringify(err.response?.data || err.message))
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

// In production, serve the built Vite frontend
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3003
app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`)
})
