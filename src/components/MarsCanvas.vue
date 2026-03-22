<template>
  <div class="relative w-full h-full">
    <canvas ref="canvasRef" class="block w-full h-full" />
    <div ref="css2dRef" class="absolute inset-0 pointer-events-none overflow-hidden" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useThreeScene } from '@/composables/useThreeScene'
import { useMarsData } from '@/composables/useMarsData'
import { MarsScene } from '@/three/MarsScene'
import type { Landmark, LandmarkHoverEvent } from '@/types/landmark'

const emit = defineEmits<{
  ready: []
  hover: [event: LandmarkHoverEvent | null]
  select: [landmark: Landmark]
  progress: [loaded: number, total: number]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const css2dRef = ref<HTMLDivElement | null>(null)

const { init, startLoop, flyTo, getCamera, getPointer, setClickHandler, dispose } = useThreeScene()
const { loadLandmarks } = useMarsData()

let marsScene: MarsScene | null = null

onMounted(async () => {
  if (!canvasRef.value || !css2dRef.value) return

  init(canvasRef.value, css2dRef.value)

  const landmarks = await loadLandmarks()

  marsScene = new MarsScene(landmarks, (loaded, total) => {
    emit('progress', loaded, total)
  })

  marsScene.landmarks.onHover = (event) => emit('hover', event)
  marsScene.landmarks.onClick = (landmark) => {
    emit('select', landmark)
    const target = marsScene!.landmarks.getLandmarkTarget(landmark.id)
    if (target) flyTo(target.position, target.distance)
  }

  setClickHandler((pointer, camera) => {
    marsScene?.landmarks.clickTest(pointer, camera)
  })

  await marsScene.init()

  startLoop(marsScene.scene, (elapsed) => {
    marsScene!.update(elapsed)
    const cam = getCamera()
    if (cam) {
      marsScene!.globe.checkDetailLevel(cam.position.length())
      marsScene!.landmarks.updateVisibility(cam)
      marsScene!.landmarks.pick(getPointer(), cam)
    }
  })

  emit('ready')
})

onUnmounted(() => {
  marsScene?.dispose()
  dispose()
})
</script>
