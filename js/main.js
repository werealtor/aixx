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

/* 顶部菜单不变 */

/* Hero 视频不变 */

/* 上传预览 + 验证 */
function initUploadPreview(){
  const form = document.getElementById("custom-form");
  const upload = document.getElementById("image-upload");
  const previewImg = document.getElementById("preview-image");
  const previewBox = document.getElementById("preview-box");
  const fileNameEl = document.getElementById("file-name");
  if(!upload || !previewImg || !previewBox || !form) return;

  upload.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if(!file){ fileNameEl.textContent = "no file selected"; previewBox.style.display="none"; return; }
    if(!["image/png","image/jpeg"].includes(file.type)){ alert("Only PNG/JPEG allowed."); upload.value=""; previewBox.style.display="none"; return; }
    if(file.size > 10 * 1024 * 1024){ alert("Max 10MB."); upload.value=""; previewBox.style.display="none"; return; }
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = ev => { previewImg.src = ev.target.result; previewBox.style.display="flex"; };
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

/* 产品轮播 + 库存检查 */
async function initProducts(){
  try{
    const res = await fetch("config.json?v=" + Date.now(), { cache: "no-store" });
    if(!res.ok) throw new Error("config load failed");
    const data = await res.json();
    if(Array.isArray(data?.products)) setupProducts(data.products);
  }catch(e){ 
    console.error(e);
    document.querySelectorAll('.card').forEach(card => {
      card.querySelector('.main-viewport').innerHTML += '<p style="text-align:center;color:red;">加载失败，请刷新重试</p>';
    });
  }
}

function setupProducts(products){
  products.forEach(product => {
    const card = document.querySelector(`.card[data-product="${product.id}"]`);
    if(!card) return;

    // ... (轮播代码不变)

    // 添加到购物车 + 库存检查
    const addBtn = card.querySelector(".add-to-cart");
    addBtn.addEventListener("click", async () => {
      try {
        const stockRes = await fetch(`${WORKERS_URL}/check-stock?id=${product.id}&variant=${index}`);
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
}

/* 主题切换不变 */

/* 购物车不变 */

/* 联系表单 + 验证 */
document.getElementById("contact-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (!e.target.checkValidity()) { alert('Please fill all fields correctly.'); return; }
  const data = { 
    name: e.target[0].value, 
    email: e.target[1].value, 
    message: e.target[2].value 
  };
  try {
    const res = await fetch(`${WORKERS_URL}/contact`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    alert('Sent!');
  } catch (error) {
    alert(`Send failed: ${error.message}`);
  }
});

/* 结账不变 */