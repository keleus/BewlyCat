<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import type { ShadowCurvePoint } from '~/logic/storage'

interface Props {
  modelValue: ShadowCurvePoint[]
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  width: 280,
  height: 160,
})

const emit = defineEmits<{
  'update:modelValue': [value: ShadowCurvePoint[]]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const selectedPointIndex = ref<number | null>(null)
const isDragging = ref(false)
const padding = 16

// Sort points by position for rendering
const sortedPoints = computed(() => {
  return [...props.modelValue].sort((a, b) => a.position - b.position)
})

// Convert point to canvas coordinates
function pointToCanvas(point: ShadowCurvePoint): { x: number, y: number } {
  const drawWidth = props.width - padding * 2
  const drawHeight = props.height - padding * 2
  return {
    x: padding + (point.position / 100) * drawWidth,
    y: padding + ((100 - point.opacity) / 100) * drawHeight,
  }
}

// Convert canvas coordinates to point
function canvasToPoint(x: number, y: number): ShadowCurvePoint {
  const drawWidth = props.width - padding * 2
  const drawHeight = props.height - padding * 2
  const position = Math.max(0, Math.min(100, ((x - padding) / drawWidth) * 100))
  const opacity = Math.max(0, Math.min(100, 100 - ((y - padding) / drawHeight) * 100))
  return { position: Math.round(position), opacity: Math.round(opacity) }
}

// Find point near cursor
function findPointAt(x: number, y: number, threshold = 10): number | null {
  for (let i = 0; i < props.modelValue.length; i++) {
    const canvasPos = pointToCanvas(props.modelValue[i])
    const dist = Math.sqrt((x - canvasPos.x) ** 2 + (y - canvasPos.y) ** 2)
    if (dist <= threshold)
      return i
  }
  return null
}

// Find if cursor is near the line (for creating new points by dragging)
function isNearLine(x: number, y: number, threshold = 8): boolean {
  const sorted = sortedPoints.value
  if (sorted.length < 2)
    return false

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = pointToCanvas(sorted[i])
    const p2 = pointToCanvas(sorted[i + 1])

    // Check if x is between the two points
    if (x < Math.min(p1.x, p2.x) - threshold || x > Math.max(p1.x, p2.x) + threshold)
      continue

    // Calculate distance from point to line segment
    const lineLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
    if (lineLen === 0)
      continue

    const t = Math.max(0, Math.min(1, ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / (lineLen ** 2)))
    const projX = p1.x + t * (p2.x - p1.x)
    const projY = p1.y + t * (p2.y - p1.y)
    const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2)

    if (dist <= threshold) {
      return true
    }
  }

  return false
}

// Draw the curve editor
function draw() {
  const canvas = canvasRef.value
  if (!canvas)
    return

  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const dpr = window.devicePixelRatio || 1
  canvas.width = props.width * dpr
  canvas.height = props.height * dpr
  ctx.scale(dpr, dpr)

  // Clear canvas
  ctx.clearRect(0, 0, props.width, props.height)

  const drawWidth = props.width - padding * 2
  const drawHeight = props.height - padding * 2

  // Draw background grid
  ctx.strokeStyle = 'var(--bew-border-color, rgba(128, 128, 128, 0.2))'
  ctx.lineWidth = 1

  // Vertical grid lines (position)
  for (let i = 0; i <= 10; i++) {
    const x = padding + (i / 10) * drawWidth
    ctx.beginPath()
    ctx.moveTo(x, padding)
    ctx.lineTo(x, padding + drawHeight)
    ctx.stroke()
  }

  // Horizontal grid lines (opacity)
  for (let i = 0; i <= 10; i++) {
    const y = padding + (i / 10) * drawHeight
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(padding + drawWidth, y)
    ctx.stroke()
  }

  // Draw border
  ctx.strokeStyle = 'var(--bew-border-color, rgba(128, 128, 128, 0.5))'
  ctx.lineWidth = 1.5
  ctx.strokeRect(padding, padding, drawWidth, drawHeight)

  // Draw filled area under curve
  if (sortedPoints.value.length >= 2) {
    ctx.beginPath()
    const firstPoint = pointToCanvas(sortedPoints.value[0])
    ctx.moveTo(firstPoint.x, padding + drawHeight)
    ctx.lineTo(firstPoint.x, firstPoint.y)

    for (const point of sortedPoints.value) {
      const pos = pointToCanvas(point)
      ctx.lineTo(pos.x, pos.y)
    }

    const lastPoint = pointToCanvas(sortedPoints.value[sortedPoints.value.length - 1])
    ctx.lineTo(lastPoint.x, padding + drawHeight)
    ctx.closePath()

    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.fill()
  }

  // Draw curve line (thicker for easier dragging)
  ctx.beginPath()
  ctx.strokeStyle = 'var(--bew-theme-color, #00a1d6)'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  sortedPoints.value.forEach((point, index) => {
    const pos = pointToCanvas(point)
    if (index === 0) {
      ctx.moveTo(pos.x, pos.y)
    }
    else {
      ctx.lineTo(pos.x, pos.y)
    }
  })
  ctx.stroke()

  // Draw control points (all points are visible)
  sortedPoints.value.forEach((point) => {
    // Find original index
    const originalIndex = props.modelValue.findIndex(p => p.position === point.position && p.opacity === point.opacity)
    const isEndpoint = point.position === 0 || point.position === 100
    const isSelected = selectedPointIndex.value === originalIndex

    const pos = pointToCanvas(point)

    // Point circle
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, isSelected ? 7 : 5, 0, Math.PI * 2)

    if (isSelected) {
      ctx.fillStyle = 'var(--bew-theme-color, #00a1d6)'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.fill()
      ctx.stroke()
    }
    else if (isEndpoint) {
      ctx.fillStyle = 'rgba(128, 128, 128, 0.8)'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.fill()
      ctx.stroke()
    }
    else {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = 'var(--bew-theme-color, #00a1d6)'
      ctx.lineWidth = 2
      ctx.fill()
      ctx.stroke()
    }
  })

  // Draw labels
  ctx.fillStyle = 'var(--bew-text-2, rgba(128, 128, 128, 0.8))'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('0%', padding, props.height - 2)
  ctx.fillText('100%', props.width - padding, props.height - 2)
  ctx.textAlign = 'left'
  ctx.fillText('100', 2, padding + 4)
  ctx.fillText('0', 2, props.height - padding)
}

// Mouse event handlers
function handleMouseDown(e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect)
    return

  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const pointIndex = findPointAt(x, y)

  if (pointIndex !== null) {
    // Clicking on existing point - start dragging it
    selectedPointIndex.value = pointIndex
    isDragging.value = true
  }
  else if (isNearLine(x, y)) {
    // Clicking on the line - create new point and start dragging it
    const newPoint = canvasToPoint(x, y)
    // Don't add at position 0 or 100
    if (newPoint.position > 0 && newPoint.position < 100) {
      // Add the new point
      const newPoints = [...props.modelValue, newPoint]
      emit('update:modelValue', newPoints)

      // Use nextTick to ensure Vue has updated the modelValue before we select the point
      nextTick(() => {
        // Find the index of the newly added point
        const newIndex = props.modelValue.findIndex(
          p => p.position === newPoint.position && p.opacity === newPoint.opacity,
        )
        if (newIndex !== -1) {
          selectedPointIndex.value = newIndex
          isDragging.value = true
        }
      })
    }
  }
  else {
    selectedPointIndex.value = null
  }
}

function handleMouseMove(e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect)
    return

  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  // Update cursor based on whether we're near a point or the line
  if (canvasRef.value && !isDragging.value) {
    const pointIndex = findPointAt(x, y)
    const nearLine = isNearLine(x, y)
    if (pointIndex !== null) {
      canvasRef.value.style.cursor = 'grab'
    }
    else if (nearLine) {
      canvasRef.value.style.cursor = 'crosshair'
    }
    else {
      canvasRef.value.style.cursor = 'default'
    }
  }

  // Handle dragging
  if (!isDragging.value || selectedPointIndex.value === null)
    return

  if (canvasRef.value) {
    canvasRef.value.style.cursor = 'grabbing'
  }

  const newPoint = canvasToPoint(x, y)
  const currentPoint = props.modelValue[selectedPointIndex.value]

  if (!currentPoint)
    return

  // Endpoints can only adjust opacity, not position
  if (currentPoint.position === 0 || currentPoint.position === 100) {
    newPoint.position = currentPoint.position
  }

  const newPoints = [...props.modelValue]
  newPoints[selectedPointIndex.value] = newPoint
  emit('update:modelValue', newPoints)
}

function handleMouseUp() {
  isDragging.value = false
}

function handleContextMenu(e: MouseEvent) {
  e.preventDefault()

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect)
    return

  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const pointIndex = findPointAt(x, y)

  if (pointIndex !== null) {
    deletePoint(pointIndex)
  }
}

function deletePoint(index: number) {
  const point = props.modelValue[index]

  // Cannot delete endpoints
  if (point.position === 0 || point.position === 100)
    return

  const newPoints = props.modelValue.filter((_, i) => i !== index)
  emit('update:modelValue', newPoints)
  selectedPointIndex.value = null
}

function handleKeyDown(e: KeyboardEvent) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPointIndex.value !== null) {
    deletePoint(selectedPointIndex.value)
  }
}

// Lifecycle
onMounted(() => {
  draw()
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('keydown', handleKeyDown)
})

watch(() => props.modelValue, draw, { deep: true })
watch(() => [props.width, props.height], draw)
</script>

<template>
  <div class="shadow-curve-editor">
    <canvas
      ref="canvasRef"
      :width="width"
      :height="height"
      :style="{ width: `${width}px`, height: `${height}px` }"
      class="curve-canvas"
      @mousedown="handleMouseDown"
      @contextmenu="handleContextMenu"
    />
    <p class="hint">
      {{ $t('settings.video_card_shadow_curve_hint') }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.shadow-curve-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: fit-content;
}

.curve-canvas {
  border-radius: var(--bew-radius);
  background: var(--bew-fill-1);
}

.hint {
  font-size: 11px;
  color: var(--bew-text-3);
  margin: 0;
}
</style>
