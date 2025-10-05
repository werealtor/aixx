import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('*', cors({ origin: '*' })); // 添加CORS

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// 联系表单：存储到D1并发送邮件
app.post('/contact', async (c) => {
  const { name, email, message } = await c.req.json();
  const db = c.env.DB;

  try {
    await db.prepare("INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)")
      .bind(name, email, message)
      .run();

    const mailRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer YOUR_SENDGRID_API_KEY', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'your@email.com' }] }],
        from: { email: 'no-reply@casei.com' },
        subject: `New Contact: ${name}`,
        content: [{ type: 'text/plain', value: `From: ${email}\nMessage: ${message}` }]
      })
    });
    if (!mailRes.ok) throw new Error('Mail failed');

    c.res.headers.set('Cache-Control', 'max-age=3600');
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// 上传：存储到R2并记录到D1 + 额外验证
app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('image-upload');
  const deviceModel = formData.get('device_model');
  if (!file || !deviceModel || file.size > 10 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) {
    return c.json({ error: 'Invalid file or model' }, 400);
  }

  const db = c.env.DB;
  const bucket = c.env.UPLOADS_BUCKET;
  const key = `${Date.now()}-${file.name}`;

  try {
    await bucket.put(key, file.stream());
    const userId = c.req.query('user_id') || 'anonymous';
    await db.prepare("INSERT INTO custom_uploads (user_id, file_url, device_model) VALUES (?, ?, ?)")
      .bind(userId, `https://your-r2-domain/${key}`, deviceModel)
      .run();
    c.res.headers.set('Cache-Control', 'max-age=3600');
    return c.json({ success: true, url: `https://your-r2-domain/${key}` });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// 结账：存储订单到D1并创建Stripe会话
app.post('/checkout', async (c) => {
  const { cart, userId } = await c.req.json();
  const db = c.env.DB;
  const stripe = await import('stripe').then(m => new m.default('YOUR_STRIPE_SECRET_KEY'));

  try {
    let total = 0;
    for (const item of cart) {
      total += item.price * item.quantity;
      await db.prepare("INSERT INTO orders (user_id, product_id, variant, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(userId || 'anonymous', item.id, item.variant, item.quantity, item.price, item.price * item.quantity)
        .run();
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: cart.map(item => ({
        price_data: { currency: 'usd', product_data: { name: item.id }, unit_amount: item.price * 100 },
        quantity: item.quantity
      })),
      mode: 'payment',
      success_url: 'https://your-site/success',
      cancel_url: 'https://your-site/cancel'
    });

    c.res.headers.set('Cache-Control', 'max-age=3600');
    return c.json({ sessionId: session.id });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// 查询订单示例
app.get('/orders', async (c) => {
  const db = c.env.DB;
  const userId = c.req.query('user_id');

  try {
    const orders = await db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
      .bind(userId)
      .all();
    c.res.headers.set('Cache-Control', 'max-age=300');
    return c.json(orders.results);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// 检查库存 (假设D1有stock表)
app.get('/check-stock', async (c) => {
  const { id, variant } = c.req.query();
  const db = c.env.DB;
  try {
    const result = await db.prepare("SELECT quantity FROM stock WHERE product_id = ? AND variant = ?")
      .bind(id, variant)
      .first();
    c.res.headers.set('Cache-Control', 'max-age=300');
    return c.json({ stock: result?.quantity || 0 });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

export default app;
