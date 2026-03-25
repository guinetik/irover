<template>
  <div class="patron-placeholder">
    <p>PATRON SELECTION — COMING SOON</p>
    <button @click="$router.push('/globe')">[ SKIP TO GLOBE ]</button>
  </div>
</template>

<style scoped>
.patron-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #000;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  gap: 24px;
}

button {
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.3);
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  padding: 8px 24px;
  cursor: pointer;
}

button:hover {
  border-color: rgba(196, 149, 106, 0.6);
  color: rgba(196, 149, 106, 1);
}
</style>
