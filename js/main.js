const WORKERS_URL = 'https://casei-backend.youraccount.workers.dev'; // 替换为您的Workers URL

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  initVideo();
  initUploadPreview();
  initProducts();
  initThemeToggle();
  updateCartDisplay();
  document.title = 'Case&i - Home'; // 动态title示例
});

/* ========== 顶部菜单（移动端抽屉） ========== */
function initMenu() {
  const menuBtn = document.querySelector(".menu-icon");
  const wrap = document.querySelector(".top-nav-wrap");
  const list = document.querySelector(".top-nav");
  if (!menuBtn || !wrap || !list) return;

  const closeMenu = () => {
    wrap.classList.remove("active");
    document.body.classList.remove("menu-open");
    menuBtn.setAttribute("aria-expanded", "false");
  };

  menuBtn.addEventListener("click", () => {
    const active = wrap.classList.toggle("active");
    document.body.classList.toggle("menu-open", active);
    menuBtn.setAttribute("aria-expanded", active ? "true" : "false");
  });

  wrap.addEventListener("click", e => { if (e.target === wrap) closeMenu(); });
  list.querySelectorAll("a[href^='#']").forEach(a => a.addEventListener("click", closeMenu));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && wrap.classList.contains("active")) closeMenu(); });
}

/* ========== Hero 视频 ========== */
function initVideo() {
  const v = document.querySelector(".hero-media");
  if (!v) return;
  v.muted = true; v.playsInline = true; v.setAttribute("webkit-playsinline", "true");
  const tryPlay = () => v.play().catch(() => {});
  tryPlay();
  const oncePlay = () => { tryPlay(); window.removeEventListener("touchstart", oncePlay); window.removeEventListener("click", oncePlay); };
  window.addEventListener("touchstart", oncePlay, { once: true, passive: true });
  window.addEventListener("click", oncePlay, { once: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tryPlay(); });
}

/* ========== 上传预览 + 验证 ========== */
function initUploadPreview() {
  const form = document.getElementById("custom-form");
  const upload = document.getElementById("image-upload");
  const previewImg = document.getElementById("preview-image");
  const previewBox = document.getElementById("preview-box");
  const fileNameEl = document.getElementById("file-name");
  if (!upload || !previewImg || !previewBox || !form) return;

  upload.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) { fileNameEl.textContent = "no file selected"; previewBox.style.display = "none"; return; }
    if (!["image/png", "image/jpeg"].includes(file.type)) { alert("Only PNG/JPEG allowed."); upload.value = ""; previewBox.style.display = "none"; return; }
    if (file.size > 10 * 1024 * 1024) { alert("Max 10MB."); upload.value = ""; previewBox.style.display = "none"; return; }
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = ev => { previewImg.src = ev.target.result; previewBox.style.display = "flex"; };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!form.checkValidity()) { alert('Please fill all fields.'); return; }
    const formData = new FormData(form);
    try {
      const res = await fetch(`${WORKERS_URL}/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      alert('Uploaded!');
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    }
  });
}

/* ========== 产品轮播 + 价格联动 + 库存检查 ========== */
async function initProducts() {
  try {
    const res = await fetch("/config.json?v=" + Date.now(), { cache: "no-store" });  // 使用绝对路径避免相对路径问题
    if (!res.ok) {
      throw new Error(`Failed to load config.json: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (Array.isArray(data?.products)) setupProducts(data.products);
  } catch (e) {
    console.error("InitProducts Error:", e);
    alert(`Error: ${e.message}`);
    document.querySelectorAll('.card').forEach(card => {
      card.querySelector('.main-viewport').innerHTML += '<p style="text-align:center;color:red;">加载失败，请刷新重试</p>';
    });
  }
}

function setupProducts(products) {
  products.forEach(product => {
    const card = document.querySelector(`.card[data-product="${product.id}"]`);
    if (!card) return;

    const images = Array.isArray(product.images) ? product.images : [];
    const prices = Array.isArray(product.price) ? product.price : [];
    const slidesData = images.map((img, i) => ({
      image: img,
      price: typeof prices[i] === "number" ? prices[i] : (typeof product.price === "number" ? product.price : null)
    }));

    const track = card.querySelector(".main-track");
    const priceEl = card.querySelector(".price");
    const viewport = card.querySelector(".main-viewport");

    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', 'Product carousel');

    // 注入剩余 slides
    for (let i = 1; i < slidesData.length; i++) {
      const slide = document.createElement("div");
      slide.className = "slide";
      const img = document.createElement("img");
      img.src = slidesData[i].image;
      img.alt = `${product.name || product.id} ${i+1}`;
      img.loading = "lazy";
      slide.appendChild(img);
      track.appendChild(slide);
    }

    // ARIA live 区域
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.style.position = 'absolute'; liveRegion.style.width = '1px'; liveRegion.style.height = '1px'; liveRegion.style.overflow = 'hidden';
    viewport.appendChild(liveRegion);

    // 箭头
    const leftBtn = document.createElement("button");
    const rightBtn = document.createElement("button");
    leftBtn.className = "nav-arrow left";
    rightBtn.className = "nav-arrow right";
    leftBtn.setAttribute("aria-label", "Previous slide");
    rightBtn.setAttribute("aria-label", "Next slide");
    leftBtn.textContent = "‹";
    rightBtn.textContent = "›";
    viewport.appendChild(leftBtn);
    viewport.appendChild(rightBtn);

    // Dots
    const dotsContainer = document.createElement("div");
    dotsContainer.className = "dots";
    slidesData.forEach((_, i) => {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-label", `Slide ${i+1}`);
      dot.addEventListener("click", () => {
        update(i);
        stopAuto();
        setTimeout(startAuto, 5000);
      });
      dotsContainer.appendChild(dot);
    });
    viewport.appendChild(dotsContainer);

    // 暂停按钮
    const pauseBtn = document.createElement("button");
    pauseBtn.className = "pause-btn";
    pauseBtn.textContent = "❚❚";
    pauseBtn.setAttribute("aria-label", "Pause autoplay");
    viewport.appendChild(pauseBtn);

    let index = 0, timer = null, paused = false;
    const slides = track.children;
    const totalSlides = slides.length;
    const dots = dotsContainer.children;

    if (totalSlides <= 1) return;

    function update(nextIndex, announce = true) {
      index = (nextIndex + totalSlides) % totalSlides;
      requestAnimationFrame(() => {
        track.style.transform = `translateX(-${index * 100}%)`;
      });
      Array.from(dots).forEach((d, i) => d.classList.toggle("active", i === index));
      if (priceEl) {
        const p = slidesData[index]?.price;
        priceEl.textContent = (typeof p === "number") ? `$${p}` : priceEl.textContent;
      }
      const nextImg = new Image();
      nextImg.src = slidesData[(index + 1) % totalSlides].image;
      if (announce) liveRegion.textContent = `Slide ${index + 1} of ${totalSlides}`;
      pauseBtn.textContent = paused ? "▶" : "❚❚";
      pauseBtn.setAttribute("aria-label", paused ? "Play autoplay" : "Pause autoplay");
    }

    function scheduleNext(delay = 5000) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        update(index + 1);
        scheduleNext();
      }, delay);
    }

    function startAuto() {
      paused = false;
      scheduleNext();
      viewport.classList.remove("paused");
    }

    function stopAuto() {
      paused = true;
      if (timer) clearTimeout(timer);
      viewport.classList.add("paused");
    }

    leftBtn.addEventListener("click", () => {
      update(index - 1);
      stopAuto();
      setTimeout(startAuto, 5000);
    });

    rightBtn.addEventListener("click", () => {
      update(index + 1);
      stopAuto();
      setTimeout(startAuto, 5000);
    });

    pauseBtn.addEventListener("click", () => {
      if (paused) startAuto();
      else stopAuto();
      update(index, false);
    });

    viewport.addEventListener("mouseenter", stopAuto);
    viewport.addEventListener("mouseleave", startAuto);

    // 触摸拖拽
    let startX = 0, currentX = 0, dragging = false;
    viewport.addEventListener("touchstart", e => {
      dragging = true; startX = e.touches[0].clientX; stopAuto(); track.style.transition = "none";
    }, { passive: true });
    viewport.addEventListener("touchmove", e => {
      if (!dragging) return;
      currentX = e.touches[0].clientX;
      const offset = (currentX - startX) / viewport.offsetWidth * 100;
      track.style.transform = `translateX(calc(-${index * 100}% + ${offset}%))`;
    }, { passive: true });
    viewport.addEventListener("touchend", () => {
      if (!dragging) return;
      dragging = false; track.style.transition = "transform .3s ease";
      const d = currentX - startX;
      if (d > 50) update(index - 1);
      else if (d < -50) update(index + 1);
      else update(index);
      setTimeout(startAuto, 5000);
    });

    // 键盘
    viewport.setAttribute("tabindex", "0");
    viewport.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") { update(index - 1); }
      else if (e.key === "ArrowRight") { update(index + 1); }
      stopAuto();
      setTimeout(startAuto, 5000);
    });

    // Observer
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) startAuto();
      else stopAuto();
    }, { threshold: 0.5 });
    observer.observe(card);

    update(0);

    // 添加到购物车 + 库存检查
    const addBtn = card.querySelector(".add-to-cart");
    addBtn.addEventListener("click", async () => {
      try {
        const stockRes = await fetch(`${WORKERS_URL}/check-stock?id=${product.id}&variant=${index}`);
        if (!stockRes.ok) throw new Error(await stockRes.text());
        const { stock } = await stockRes.json();
        if (stock <= 0) { alert('Out of stock!'); return; }

        const cart = JSON.parse(localStorage.getItem("cart") || "[]");
        const item = {
          id: product.id,
          name: product.name,
          variant: index,
          image: slidesData[index].image,
          price: slidesData[index].price,
          quantity: 1
        };
        const existing = cart.find(i => i.id === item.id && i.variant === item.variant);
        if (existing) existing.quantity++;
        else cart.push(item);
        localStorage.setItem("cart", JSON.stringify(cart));
        updateCartDisplay();
        alert("Added to cart!");
      } catch (error) {
        alert(`Error: ${error.message}`);
      }
    });
  });