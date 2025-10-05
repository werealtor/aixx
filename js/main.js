// ====== CONFIG ======
const WORKERS_URL = 'https://casei-backend.youraccount.workers.dev'; // ← 替换为你的 Workers URL
const STRIPE_PUBLISHABLE_KEY = 'pk_live_xxx_or_pk_test_xxx';          // ← 替换为你的 Stripe 公钥（仅前端可见）

// ====== STARTUP ======
document.addEventListener('DOMContentLoaded', () => {
  try { initMenu(); } catch(e){ console.error(e); }
  try { initVideo(); } catch(e){ console.error(e); }
  try { initUploadPreview(); } catch(e){ console.error(e); }
  try { initProducts(); } catch(e){ console.error(e); }
  try { initThemeToggle(); } catch(e){ console.error(e); }
  try { attachContactHandler(); } catch(e){ console.error(e); }
  try { attachCheckoutHandler(); } catch(e){ console.error(e); }
  updateCartDisplay();
  document.title = 'Case&i — Home';
});

/* ========== 顶部菜单（移动端抽屉） ========== */
function initMenu() {
  const menuBtn = document.querySelector('.menu-icon');
  const wrap = document.querySelector('.top-nav-wrap');
  const list = document.querySelector('.top-nav');
  if (!menuBtn || !wrap || !list) return;

  const closeMenu = () => {
    wrap.classList.remove('active');
    document.body.classList.remove('menu-open');
    wrap.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
  };

  menuBtn.addEventListener('click', () => {
    const active = wrap.classList.toggle('active');
    document.body.classList.toggle('menu-open', active);
    wrap.setAttribute('aria-hidden', active ? 'false' : 'true');
    menuBtn.setAttribute('aria-expanded', active ? 'true' : 'false');
  });

  wrap.addEventListener('click', e => { if (e.target === wrap) closeMenu(); });
  list.querySelectorAll("a[href^='#']").forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && wrap.classList.contains('active')) closeMenu(); });
}

/* ========== Hero 视频 ========== */
function initVideo() {
  const v = document.querySelector('.hero-media');
  if (!v) return;
  v.muted = true; v.playsInline = true; v.setAttribute('webkit-playsinline','true');
  const tryPlay = () => v.play().catch(()=>{});
  tryPlay();
  const oncePlay = () => { tryPlay(); window.removeEventListener('touchstart', oncePlay); window.removeEventListener('click', oncePlay); };
  window.addEventListener('touchstart', oncePlay, { once:true, passive:true });
  window.addEventListener('click', oncePlay, { once:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryPlay(); });
}

/* ========== 上传预览 + 验证 ========== */
function initUploadPreview() {
  const form = document.getElementById('custom-form');
  const upload = document.getElementById('image-upload');
  const previewImg = document.getElementById('preview-image');
  const previewBox = document.getElementById('preview-box');
  const fileNameEl = document.getElementById('file-name');
  if (!upload || !previewImg || !previewBox || !form) return;

  upload.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) { fileNameEl.textContent = 'no file selected'; previewBox.style.display = 'none'; return; }
    if (!['image/png','image/jpeg'].includes(file.type)) { alert('Only PNG/JPEG allowed.'); upload.value=''; previewBox.style.display='none'; return; }
    if (file.size > 10 * 1024 * 1024) { alert('Max 10MB.'); upload.value=''; previewBox.style.display='none'; return; }
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = ev => { previewImg.src = ev.target.result; previewBox.style.display = 'flex'; };
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.checkValidity()) { alert('Please fill all fields.'); return; }
    const fd = new FormData(form);
    try {
      const res = await fetch(`${WORKERS_URL}/upload`, { method:'POST', body:fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      alert('Uploaded!');
      console.log('R2 URL:', data?.url);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    }
  });
}

/* ========== 产品 + 轮播 + 库存检查 ========== */
async function initProducts() {
  const cfgUrl = '/config.json?v=' + Date.now();
  let data;
  try {
    const res = await fetch(cfgUrl, { cache:'no-store' });
    if (!res.ok) throw new Error(`config.json ${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (e) {
    console.error('InitProducts Error:', e);
    // 兜底提示（不打断页面）
    document.querySelectorAll('.card .main-viewport').forEach(vp => {
      const p = document.createElement('p');
      p.style.cssText = 'text-align:center;color:#b00;padding:10px';
      p.textContent = 'Config failed to load. Please refresh.';
      vp.appendChild(p);
    });
    return;
  }

  if (!Array.isArray(data?.products)) return;
  setupProducts(data.products);
}

function setupProducts(products) {
  products.forEach(product => {
    const card = document.querySelector(`.card[data-product="${product.id}"]`);
    if (!card) return;

    const images = Array.isArray(product.images) ? product.images : [];
    const prices = Array.isArray(product.price) ? product.price : [];
    const slidesData = images.map((img, i) => ({
      image: ensureAbs(img),
      price: typeof prices[i] === 'number' ? prices[i] : (typeof product.price === 'number' ? product.price : null)
    }));

    const track = card.querySelector('.main-track');
    const priceEl = card.querySelector('.price');
    const viewport = card.querySelector('.main-viewport');

    viewport.setAttribute('role','region');
    viewport.setAttribute('aria-label','Product carousel');

    // 注入剩余 slides
    for (let i = 1; i < slidesData.length; i++) {
      const slide = document.createElement('div');
      slide.className = 'slide';
      const img = document.createElement('img');
      img.src = slidesData[i].image;
      img.alt = `${product.name || product.id} ${i+1}`;
      img.loading = 'lazy';
      slide.appendChild(img);
      track.appendChild(slide);
    }

    // live region
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live','polite');
    Object.assign(liveRegion.style,{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(1px,1px,1px,1px)'});
    viewport.appendChild(liveRegion);

    // 箭头
    const leftBtn = document.createElement('button');
    const rightBtn = document.createElement('button');
    leftBtn.className = 'nav-arrow left'; rightBtn.className = 'nav-arrow right';
    leftBtn.setAttribute('aria-label','Previous slide'); rightBtn.setAttribute('aria-label','Next slide');
    leftBtn.textContent = '‹'; rightBtn.textContent = '›';
    viewport.appendChild(leftBtn); viewport.appendChild(rightBtn);

    // Dots
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'dots';
    slidesData.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-label', `Slide ${i+1}`);
      dot.addEventListener('click', () => { update(i); stopAuto(); setTimeout(startAuto, 5000); });
      dotsContainer.appendChild(dot);
    });
    viewport.appendChild(dotsContainer);

    // 暂停
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'pause-btn';
    pauseBtn.textContent = '❚❚';
    pauseBtn.setAttribute('aria-label','Pause autoplay');
    viewport.appendChild(pauseBtn);

    let index = 0, timer = null, paused = false;
    const totalSlides = track.children.length;
    const dots = dotsContainer.children;

    if (totalSlides <= 1) return;

    function update(nextIndex, announce = true) {
      index = (nextIndex + totalSlides) % totalSlides;
      requestAnimationFrame(() => { track.style.transform = `translateX(-${index * 100}%)`; });
      Array.from(dots).forEach((d, i) => d.classList.toggle('active', i === index));
      if (priceEl) {
        const p = slidesData[index]?.price;
        if (typeof p === 'number') priceEl.textContent = `$${formatMoney(p)}`;
      }
      const pre = new Image(); pre.src = slidesData[(index + 1) % totalSlides].image;
      if (announce) liveRegion.textContent = `Slide ${index + 1} of ${totalSlides}`;
      pauseBtn.textContent = paused ? '▶' : '❚❚';
      pauseBtn.setAttribute('aria-label', paused ? 'Play autoplay' : 'Pause autoplay');
    }

    function scheduleNext(delay = 5000) {
      clearTimeout(timer);
      timer = setTimeout(() => { update(index + 1); scheduleNext(); }, delay);
    }

    function startAuto(){ paused = false; scheduleNext(); viewport.classList.remove('paused'); }
    function stopAuto(){ paused = true; clearTimeout(timer); viewport.classList.add('paused'); }

    leftBtn.addEventListener('click', () => { update(index - 1); stopAuto(); setTimeout(startAuto, 5000); });
    rightBtn.addEventListener('click', () => { update(index + 1); stopAuto(); setTimeout(startAuto, 5000); });
    pauseBtn.addEventListener('click', () => { paused ? startAuto() : stopAuto(); update(index,false); });

    viewport.addEventListener('mouseenter', stopAuto);
    viewport.addEventListener('mouseleave', startAuto);

    // 触摸
    let startX = 0, currentX = 0, dragging = false;
    viewport.addEventListener('touchstart', e => { dragging = true; startX = e.touches[0].clientX; stopAuto(); track.style.transition='none'; }, { passive:true });
    viewport.addEventListener('touchmove', e => {
      if (!dragging) return;
      currentX = e.touches[0].clientX;
      const offset = (currentX - startX) / viewport.offsetWidth * 100;
      track.style.transform = `translateX(calc(-${index * 100}% + ${offset}%))`;
    }, { passive:true });
    viewport.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false; track.style.transition = 'transform .3s ease';
      const d = currentX - startX;
      if (d > 50) update(index - 1);
      else if (d < -50) update(index + 1);
      else update(index);
      setTimeout(startAuto, 5000);
    });

    // 键盘
    viewport.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') update(index - 1);
      else if (e.key === 'ArrowRight') update(index + 1);
      stopAuto(); setTimeout(startAuto, 5000);
    });

    // 可见性
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) startAuto(); else stopAuto();
    }, { threshold: 0.5 });
    observer.observe(card);

    update(0);
    // 添加到购物车 + 库存检查
    const addBtn = card.querySelector('.add-to-cart');
    addBtn.addEventListener('click', async () => {
      try {
        const stockRes = await fetch(`${WORKERS_URL}/check-stock?id=${encodeURIComponent(product.id)}&variant=${index}`);
        if (!stockRes.ok) throw new Error(await stockRes.text());
        const { stock } = await stockRes.json();
        if ((stock ?? 0) <= 0) { alert('Out of stock!'); return; }

        const cart = readCart();
        const item = {
          id: product.id,
          name: product.name,
          variant: index,
          image: slidesData[index].image,
          price: slidesData[index].price ?? 0,
          quantity: 1
        };
        const existing = cart.find(i => i.id === item.id && i.variant === item.variant);
        if (existing) existing.quantity++;
        else cart.push(item);
        saveCart(cart);
        updateCartDisplay();
        alert('Added to cart!');
      } catch (error) {
        alert(`Error: ${error.message}`);
      }
    });
  });
}

function ensureAbs(path){
  if (!path) return path;
  return path.startsWith('http') || path.startsWith('/') ? path : `/${path}`;
}

/* ========== 主题切换 ========== */
function initThemeToggle() {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  const html = document.documentElement;
  let currentTheme = localStorage.getItem('theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  if (!currentTheme) currentTheme = systemDark.matches ? 'dark' : 'light';
  html.setAttribute('data-theme', currentTheme);
  refreshThemeButton(button, currentTheme);

  systemDark.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      refreshThemeButton(button, newTheme);
    }
  });

  button.addEventListener('click', () => {
    html.classList.add('theme-transition');
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    refreshThemeButton(button, currentTheme);
    setTimeout(() => html.classList.remove('theme-transition'), 300);
  });
}

function refreshThemeButton(btn, theme){
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

/* ========== 购物车 ========== */
function readCart(){ try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; } }
function saveCart(cart){ localStorage.setItem('cart', JSON.stringify(cart)); }

function updateCartDisplay() {
  const cart = readCart();
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const total = cart.reduce((sum, i) => sum + (Number(i.price)||0) * i.quantity, 0);
  const itemsEl = document.getElementById('cart-items');
  const totalEl = document.querySelector('.total');
  const countEl = document.getElementById('cart-count');

  if (countEl) countEl.textContent = count;
  if (totalEl) totalEl.textContent = `Total: $${formatMoney(total)}`;

  if (itemsEl) {
    itemsEl.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <img src="${ensureAbs(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">
        <div>${escapeHtml(item.name)} (Variant ${item.variant + 1}) — $${formatMoney(item.price)} × ${item.quantity}</div>
        <button class="remove-btn" data-index="${idx}">Remove</button>
      </div>
    `).join('');
    itemsEl.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = readCart();
        c.splice(Number(btn.dataset.index), 1);
        saveCart(c);
        updateCartDisplay();
      });
    });
  }
}

function formatMoney(n){ return Number(n).toFixed(2); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ========== 联系表单 ========== */
function attachContactHandler() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.checkValidity()) { alert('Please fill all fields correctly.'); return; }
    const data = {
      name: form.elements['name'].value.trim(),
      email: form.elements['email'].value.trim(),
      message: form.elements['message'].value.trim()
    };
    try {
      const res = await fetch(`${WORKERS_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      alert('Sent!');
      form.reset();
    } catch (error) {
      alert(`Send failed: ${error.message}`);
    }
  });
}

/* ========== 结账（Workers创建会话，前端跳转） ========== */
function attachCheckoutHandler() {
  const btn = document.getElementById('checkout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const cart = readCart();
    if (cart.length === 0) return alert('Cart empty');
    try {
      const res = await fetch(`${WORKERS_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ cart, userId: 'anonymous' })
      });
      if (!res.ok) throw new Error(await res.text());
      const { sessionId } = await res.json();
      const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) alert(error.message);
    } catch (error) {
      alert(`Checkout failed: ${error.message}`);
    }
  });
}