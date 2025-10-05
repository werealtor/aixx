import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// 允许同源与你的网站域名（建议改成你的正式域名）
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return true
    const allowed = ['https://xxkit.com', 'https://www.xxkit.com', 'http://localhost:8787']
    return allowed.includes(origin) ? origin : 'https://xxkit.com'
  },
  allowMethods: ['GET','POST','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization']
}))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

/* ===== Helpers ===== */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function sanitizeName(s){ return String(s||'').slice(0,100) }
function sanitizeText(s){ return String(s||'').slice(0,2000) }

/* ===== 联系表单：写入D1 + 发邮件 ===== */
app.post('/contact', async (c) => {
  const { name, email, message } = await c.req.json().catch(()=> ({}))
  if (!name || !email || !message) return c.json({ error:'Missing fields' }, 400)
  if (!emailRegex.test(email)) return c.json({ error:'Invalid email' }, 400)

  const db = c.env.DB
  const safeName = sanitizeName(name)
  const safeMessage = sanitizeText(message)

  try {
    await db.prepare("INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)")
      .bind(safeName, email, safeMessage).run()

    // SendGrid
    const sgKey = c.env.SENDGRID_API_KEY
    if (sgKey) {
      const mailRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: c.env.CONTACT_RECEIVER || 'owner@xxkit.com' }] }],
          from: { email: c.env.MAIL_FROM || 'no-reply@xxkit.com' },
          subject: `New Contact: ${safeName}`,
          content: [{ type: 'text/plain', value: `From: ${email}\nMessage:\n${safeMessage}` }]
        })
      })
      if (!mailRes.ok) console.warn('SendGrid mail failed', await mailRes.text())
    }

    c.header('Cache-Control','no-store')
    return c.json({ success:true })
  } catch (error) {
    return c.json({ error: error.message }, 500)
  }
})

/* ===== 上传：R2 + D1 ===== */
app.post('/upload', async (c) => {
  const form = await c.req.formData().catch(()=>null)
  if (!form) return c.json({ error:'Invalid form' }, 400)

  const file = form.get('image-upload')
  const deviceModel = form.get('device_model')
  if (!file || !deviceModel) return c.json({ error:'Invalid file or model' }, 400)
  if (file.size > 10 * 1024 * 1024) return c.json({ error:'File too large' }, 400)
  if (!['image/png','image/jpeg'].includes(file.type)) return c.json({ error:'Bad file type' }, 400)

  const keySafe = Date.now() + '-' + (file.name || 'upload').replace(/[^\w.\-]+/g,'_')
  const bucket = c.env.UPLOADS_BUCKET
  const db = c.env.DB

  try {
    await bucket.put(keySafe, file.stream(), { httpMetadata: { contentType: file.type } })
    const url = `${c.env.R2_PUBLIC_URL}/${keySafe}`
    const userId = (c.req.query('user_id') || 'anonymous').slice(0,100)

    await db.prepare("INSERT INTO custom_uploads (user_id, file_url, device_model) VALUES (?, ?, ?)")
      .bind(userId, url, String(deviceModel).slice(0,100)).run()

    c.header('Cache-Control','no-store')
    return c.json({ success:true, url })
  } catch (error) {
    return c.json({ error: error.message }, 500)
  }
})

/* ===== 结账：使用 Stripe REST（Workers 友好） ===== */
app.post('/checkout', async (c) => {
  const { cart, userId } = await c.req.json().catch(()=>({cart:[],userId:'anonymous'}))
  if (!Array.isArray(cart) || cart.length === 0) return c.json({ error:'Empty cart' }, 400)

  // 写入订单明细（可选）
  const db = c.env.DB
  try {
    for (const item of cart) {
      const qty = Number(item.quantity) || 1
      const price = Number(item.price) || 0
      await db.prepare("INSERT INTO orders (user_id, product_id, variant, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(String(userId||'anonymous').slice(0,100), String(item.id).slice(0,50), Number(item.variant)||0, qty, price, price*qty)
        .run()
    }
  } catch (e) {
    console.warn('D1 insert order failed', e)
  }

  // 创建 Checkout Session via REST
  const stripeKey = c.env.STRIPE_SECRET_KEY
  if (!stripeKey) return c.json({ error:'Stripe not configured' }, 500)

  const origin = c.req.header('origin') || 'https://xxkit.com'
  const successUrl = `${origin}/success`
  const cancelUrl  = `${origin}/cancel`

  const line_items = cart.map(item => ({
    price_data: {
      currency: 'usd',
      product_data: { name: String(item.name || item.id).slice(0,200) },
      unit_amount: Math.round((Number(item.price)||0) * 100)
    },
    quantity: Number(item.quantity)||1
  }))

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'payment_method_types[]': 'card',
      ...flattenLineItems(line_items)
    })
  })

  const text = await resp.text()
  if (!resp.ok) {
    console.error('Stripe error', text)
    return c.json({ error: 'Stripe create session failed' }, 500)
  }

  const session = JSON.parse(text)
  c.header('Cache-Control','no-store')
  return c.json({ sessionId: session.id })
})

// 将 line_items 转为 x-www-form-urlencoded
function flattenLineItems(items) {
  const params = {}
  items.forEach((it, i) => {
    params[`line_items[${i}][quantity]`] = String(it.quantity)
    params[`line_items[${i}][price_data][currency]`] = it.price_data.currency
    params[`line_items[${i}][price_data][product_data][name]`] = it.price_data.product_data.name
    params[`line_items[${i}][price_data][unit_amount]`] = String(it.price_data.unit_amount)
  })
  return params
}

/* ===== 检查库存 ===== */
app.get('/check-stock', async (c) => {
  const id = c.req.query('id')
  const variant = Number(c.req.query('variant') || 0)
  if (!id) return c.json({ error:'Missing id' }, 400)
  const db = c.env.DB
  try {
    const row = await db.prepare("SELECT quantity FROM stock WHERE product_id = ? AND variant = ?")
      .bind(id, variant).first()
    c.header('Cache-Control','max-age=60')
    return c.json({ stock: row?.quantity ?? 0 })
  } catch (error) {
    return c.json({ error: error.message }, 500)
  }
})

export default app