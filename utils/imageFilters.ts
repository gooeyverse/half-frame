export const startLiveFilterPreview = () => {
  // This function would contain the logic to start the live filter preview
  // For now, it's a placeholder
  console.log("startLiveFilterPreview called")
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0 // achromatic
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0)
    } else if (max === g) {
      h = (b - r) / d + 2
    } else if (max === b) {
      h = (r - g) / d + 4
    }

    h /= 6
  }

  return [h, s, l]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b

  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

export const applyBoxBlur = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray => {
  const blurredData = new Uint8ClampedArray(data.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      let count = 0

      for (let j = -radius; j <= radius; j++) {
        for (let i = -radius; i <= radius; i++) {
          const newX = x + i
          const newY = y + j

          if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
            const index = (newY * width + newX) * 4
            r += data[index]
            g += data[index + 1]
            b += data[index + 2]
            count++
          }
        }
      }

      const index = (y * width + x) * 4
      blurredData[index] = r / count
      blurredData[index + 1] = g / count
      blurredData[index + 2] = b / count
      blurredData[index + 3] = data[index + 3] // Keep alpha the same
    }
  }

  return blurredData
}

export const applyHalation = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data
  const halationData = new Uint8ClampedArray(data.length)

  // Threshold for bright pixels
  const threshold = 200

  // Halation intensity
  const intensity = 0.2

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]

      // Check if the pixel is bright enough to cause halation
      if (r > threshold && g > threshold && b > threshold) {
        // Apply glow to neighboring pixels
        for (let j = -2; j <= 2; j++) {
          for (let i = -2; i <= 2; i++) {
            const newX = x + i
            const newY = y + j

            if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
              const halationIndex = (newY * width + newX) * 4
              halationData[halationIndex] = Math.min(255, (halationData[halationIndex] || 0) + r * intensity)
              halationData[halationIndex + 1] = Math.min(255, (halationData[halationIndex + 1] || 0) + g * intensity)
              halationData[halationIndex + 2] = Math.min(255, (halationData[halationIndex + 2] || 0) + b * intensity)
              halationData[halationIndex + 3] = 255 // Alpha
            }
          }
        }
      }
    }
  }

  // Blend the halation effect with the original image
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] + (halationData[i] || 0))
    data[i + 1] = Math.min(255, data[i + 1] + (halationData[i + 1] || 0))
    data[i + 2] = Math.min(255, data[i + 2] + (halationData[i + 2] || 0))
  }

  context.putImageData(imageData, 0, 0)
}
