const WORKERS_URL = 'https://casei-backend.youraccount.workers.dev'; 

document.addEventListener("DOMContentLoaded", () => {
  initVideo();
  initProducts();
});

function initVideo() {
  const v = document.querySelector(".hero-media");
  if (!v) return;
  v.play().catch(()=>{});
}

async function initProducts() {
  try {
    const res = await fetch("config.json?v=" + Date.now(), { cache: "no-store" });
    const data = await res.json();
    console.log("Products loaded:", data);
  } catch (e) {
    console.error(e);
  }
}