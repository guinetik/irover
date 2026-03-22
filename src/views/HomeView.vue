<template>
  <div class="home">
    <div class="hero">
      <h1 class="title">MARS ROVERS</h1>
      <p class="subtitle">Explore the Red Planet</p>
      <button class="cta" @click="$router.push('/globe')">BEGIN MISSION</button>
    </div>
  </div>
</template>

<style scoped>
.home {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #1a0e08 0%, #000 70%);
}

.hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.title {
  font-size: clamp(4rem, 12vw, 8rem);
  font-weight: 200;
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
  animation: fadeUp 1s ease-out both;
}

.subtitle {
  font-size: clamp(0.7rem, 1.2vw, 0.9rem);
  font-weight: 300;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
  margin: 12px 0 0;
  animation: fadeUp 1s ease-out 0.3s both;
}

.cta {
  margin-top: 48px;
  padding: 12px 56px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0;
  cursor: pointer;
  transition: border-color 0.3s ease, color 0.3s ease, background 0.3s ease;
  animation: fadeUp 0.8s ease-out 0.6s both;
}

.cta:hover {
  border-color: rgba(255, 255, 255, 0.45);
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.04);
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
