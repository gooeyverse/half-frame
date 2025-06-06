"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, Download, X, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { startLiveFilterPreview, rgbToHsl, hslToRgb, applyBoxBlur, applyHalation } from "@/utils/imageFilters"

type FilterType =
  | "none"
  | "pink"
  | "cyan"
  | "ilford"
  | "fuji"
  | "polaroid"
  | "halation"
  | "css-filter"
  | "chroma-leak"
  | "red-light"

export default function CameraApp() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const liveCanvasRef = useRef<HTMLCanvasElement>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterType>("none")
  const filterInitializedRef = useRef(false)

  const getRandomFilter = (): FilterType => {
    const filters: FilterType[] = [
      "pink",
      "cyan",
      "ilford",
      "fuji",
      "polaroid",
      "halation",
      "css-filter",
      "chroma-leak",
      "red-light",
    ]
    const randomIndex = Math.floor(Math.random() * filters.length)
    return filters[randomIndex]
  }

  const startCamera = async () => {
    try {
      setError(null)
      const constraints = {
        video: { facingMode },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsActive(true)
        setHasPermission(true)

        // Select a random filter before starting the preview
        const randomFilter = getRandomFilter()
        setActiveFilter(randomFilter)
        filterInitializedRef.current = true

        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          // Start the live preview with the selected filter
          startLiveFilterPreview()
        }
      }
    } catch (err) {
      console.error("Error accessing camera:", err)
      setError("Could not access camera. Please check permissions.")
      setHasPermission(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setIsActive(false)
    }

    // Stop the animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Reset filter initialization flag
    filterInitializedRef.current = false
  }

  const toggleCamera = () => {
    if (isActive) {
      stopCamera()
    } else {
      startCamera()
    }
  }

  const switchCamera = () => {
    stopCamera()
    setFacingMode(facingMode === "user" ? "environment" : "user")
  }

  // Function to apply film curve (S-curve characteristic of film)
  const applyFilmCurve = (value: number): number => {
    // Normalize to 0-1 range
    const normalized = value / 255

    // Apply S-curve that mimics film response
    // This creates deeper shadows and brighter highlights
    const curved = Math.pow(normalized, 0.8) * 1.1

    // Clamp and convert back to 0-255 range
    return Math.min(255, Math.max(0, curved * 255))
  }

  // Function to add film grain
  const addFilmGrain = (value: number, x: number, y: number, intensity = 8): number => {
    // Create pseudo-random grain based on pixel position
    const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
    const grainAmount = (grain - 0.5) * intensity

    return Math.min(255, Math.max(0, value + grainAmount))
  }

  // Function to apply vignetting effect
  const applyVignetting = (
    value: number,
    x: number,
    y: number,
    width: number,
    height: number,
    strength = 0.3,
  ): number => {
    // Calculate distance from center
    const centerX = width / 2
    const centerY = height / 2
    const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY)
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)

    // Create vignetting factor (stronger at edges)
    const vignetteFactor = 1 - (distance / maxDistance) * strength

    return Math.min(255, Math.max(0, value * vignetteFactor))
  }

  // Function to apply Fujifilm color characteristics
  const applyFujifilmColors = (r: number, g: number, b: number): [number, number, number] => {
    // Add warm cast (slightly yellow/orange)
    const newR = Math.min(255, r * 1.08)
    const newG = Math.min(255, g * 1.02)
    const newB = Math.min(255, b * 0.95)

    // Boost saturation, especially greens and blues
    const hsl = rgbToHsl(newR, newG, newB)

    // Increase saturation more for greens and blues
    if (hsl[0] > 0.25 && hsl[0] < 0.75) {
      // Green to blue range
      hsl[1] = Math.min(1, hsl[1] * 1.35)
    } else {
      hsl[1] = Math.min(1, hsl[1] * 1.15)
    }

    // Convert back to RGB
    const [finalR, finalG, finalB] = hslToRgb(hsl[0], hsl[1], hsl[2])

    // Apply contrast boost
    const contrast = 1.15
    const adjustedR = Math.min(255, Math.max(0, (finalR - 128) * contrast + 128))
    const adjustedG = Math.min(255, Math.max(0, (finalG - 128) * contrast + 128))
    const adjustedB = Math.min(255, Math.max(0, (finalB - 128) * contrast + 128))

    return [adjustedR, adjustedG, adjustedB]
  }

  // Function to apply Polaroid color characteristics
  const applyPolaroidColors = (r: number, g: number, b: number): [number, number, number] => {
    // Convert to HSL for easier manipulation
    const hsl = rgbToHsl(r, g, b)

    // Desaturate slightly (Polaroid's washed-out look)
    hsl[1] = Math.max(0, hsl[1] * 0.85)

    // Adjust lightness (slight overexposure)
    hsl[2] = Math.min(1, hsl[2] * 1.08)

    // Convert back to RGB
    let [newR, newG, newB] = hslToRgb(hsl[0], hsl[1], hsl[2])

    // Add slight color shifts (blue/green in shadows, yellow/orange in highlights)
    if (hsl[2] < 0.5) {
      // Shadows: add slight blue/green tint
      newB = Math.min(255, newB * 1.05)
      newG = Math.min(255, newG * 1.02)
    } else {
      // Highlights: add slight yellow/orange tint
      newR = Math.min(255, newR * 1.05)
      newG = Math.min(255, newG * 1.03)
    }

    // Lower contrast (characteristic of Polaroid)
    const contrast = 0.9
    const adjustedR = Math.min(255, Math.max(0, (newR - 128) * contrast + 128))
    const adjustedG = Math.min(255, Math.max(0, (newG - 128) * contrast + 128))
    const adjustedB = Math.min(255, Math.max(0, (newB - 128) * contrast + 128))

    return [adjustedR, adjustedG, adjustedB]
  }

  // Function to apply filter to canvas
  const applyFilterToCanvas = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    filterType: FilterType,
  ) => {
    if (filterType === "none") return

    if (filterType === "pink") {
      // Pink filter: screen blend mode with #fa00cc
      context.globalCompositeOperation = "screen"
      context.fillStyle = "rgba(250, 0, 204, 0.5)" // #fa00cc with 50% opacity
      context.fillRect(0, 0, width, height)
    } else if (filterType === "cyan") {
      // For cyan filter, we need to simulate the CSS filters first
      // Get the current image data
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      // Apply brightness(104%), contrast(104%), saturate(122%)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        // Convert to HSL for saturation adjustment
        const hsl = rgbToHsl(r, g, b)
        hsl[1] = Math.min(1, hsl[1] * 1.22) // saturate(122%)
        const [newR, newG, newB] = hslToRgb(hsl[0], hsl[1], hsl[2])

        // Apply brightness and contrast
        data[i] = Math.min(255, Math.max(0, (newR * 1.04 - 128) * 1.04 + 128)) // R
        data[i + 1] = Math.min(255, Math.max(0, (newG * 1.04 - 128) * 1.04 + 128)) // G
        data[i + 2] = Math.min(255, Math.max(0, (newB * 1.04 - 128) * 1.04 + 128)) // B
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0)

      // Apply cyan overlay with multiply blend mode
      context.fillStyle = "rgba(0, 225, 250, 0.5)" // #00e1fa with 50% opacity
      context.globalCompositeOperation = "multiply"
      context.fillRect(0, 0, width, height)
    } else if (filterType === "ilford") {
      // Ilford black and white film filter
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        // Convert to grayscale using luminance weights (similar to how film responds to light)
        // Ilford film tends to be slightly more sensitive to red and less to blue
        const gray = r * 0.35 + g * 0.55 + b * 0.1

        // Apply film curve for characteristic contrast
        let filmGray = applyFilmCurve(gray)

        // Add subtle film grain
        const x = (i / 4) % width
        const y = Math.floor(i / 4 / width)
        filmGray = addFilmGrain(filmGray, x, y)

        // Apply slight warm tone characteristic of some B&W films
        const warmR = Math.min(255, filmGray * 1.02)
        const warmG = filmGray
        const warmB = Math.max(0, filmGray * 0.98)

        // Set RGB to the processed grayscale values
        data[i] = warmR // R
        data[i + 1] = warmG // G
        data[i + 2] = warmB // B
        // Alpha channel (data[i + 3]) remains unchanged
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0)
    } else if (filterType === "fuji") {
      // Fujifilm disposable camera filter
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        // Get pixel coordinates
        const x = (i / 4) % width
        const y = Math.floor(i / 4 / width)

        // Apply Fujifilm color characteristics
        let [fujiR, fujiG, fujiB] = applyFujifilmColors(r, g, b)

        // Add film grain (more pronounced than B&W)
        fujiR = addFilmGrain(fujiR, x, y, 12)
        fujiG = addFilmGrain(fujiG, x, y, 12)
        fujiB = addFilmGrain(fujiB, x, y, 12)

        // Apply vignetting
        fujiR = applyVignetting(fujiR, x, y, width, height)
        fujiG = applyVignetting(fujiG, x, y, width, height)
        fujiB = applyVignetting(fujiB, x, y, width, height)

        // Set the processed values
        data[i] = fujiR // R
        data[i + 1] = fujiG // G
        data[i + 2] = fujiB // B
        // Alpha channel (data[i + 3]) remains unchanged
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0)
    } else if (filterType === "polaroid") {
      // Polaroid instant film filter
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      // First, apply a slight blur for the soft focus look
      const blurredData = applyBoxBlur(data, width, height, 1)

      for (let i = 0; i < data.length; i += 4) {
        // Use the blurred data
        const r = blurredData[i]
        const g = blurredData[i + 1]
        const b = blurredData[i + 2]

        // Get pixel coordinates
        const x = (i / 4) % width
        const y = Math.floor(i / 4 / width)

        // Apply Polaroid color characteristics
        let [polaroidR, polaroidG, polaroidB] = applyPolaroidColors(r, g, b)

        // Add subtle film grain
        polaroidR = addFilmGrain(polaroidR, x, y, 6)
        polaroidG = addFilmGrain(polaroidG, x, y, 6)
        polaroidB = addFilmGrain(polaroidB, x, y, 6)

        // Apply stronger vignetting (characteristic of Polaroid)
        polaroidR = applyVignetting(polaroidR, x, y, width, height, 0.4)
        polaroidG = applyVignetting(polaroidG, x, y, width, height, 0.4)
        polaroidB = applyVignetting(polaroidB, x, y, width, height, 0.4)

        // Set the processed values
        data[i] = polaroidR // R
        data[i + 1] = polaroidG // G
        data[i + 2] = polaroidB // B
        // Alpha channel (data[i + 3]) remains unchanged
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0)
    } else if (filterType === "css-filter") {
      // CSS-based filter: brightness(110%) contrast(116%) hue-rotate(342deg) saturate(84%) + cyan overlay
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i]
        let g = data[i + 1]
        let b = data[i + 2]

        // Apply brightness(110%)
        r = Math.min(255, r * 1.1)
        g = Math.min(255, g * 1.1)
        b = Math.min(255, b * 1.1)

        // Apply contrast(116%)
        const contrast = 1.16
        r = Math.min(255, Math.max(0, (r - 128) * contrast + 128))
        g = Math.min(255, Math.max(0, (g - 128) * contrast + 128))
        b = Math.min(255, Math.max(0, (b - 128) * contrast + 128))

        // Convert to HSL for hue rotation and saturation
        const hsl = rgbToHsl(r, g, b)

        // Apply hue-rotate(342deg) - equivalent to -18 degrees
        hsl[0] = (hsl[0] + 342 / 360) % 1

        // Apply saturate(84%)
        hsl[1] = Math.min(1, hsl[1] * 0.84)

        // Convert back to RGB
        const [newR, newG, newB] = hslToRgb(hsl[0], hsl[1], hsl[2])

        // Set the processed values
        data[i] = newR // R
        data[i + 1] = newG // G
        data[i + 2] = newB // B
        // Alpha channel (data[i + 3]) remains unchanged
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0)

      // Apply cyan overlay with lighten blend mode (#6be9ff at 23% opacity)
      context.globalCompositeOperation = "lighten"
      context.fillStyle = "rgba(107, 233, 255, 0.23)" // #6be9ff with 23% opacity
      context.fillRect(0, 0, width, height)
    } else if (filterType === "halation") {
      // Halation film effect - glow around bright light sources
      applyHalation(context, width, height)
    } else if (filterType === "chroma-leak") {
      // Chroma filter with light leaks
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        // Get pixel coordinates
        const x = (i / 4) % width
        const y = Math.floor(i / 4 / width)

        // Apply chroma color processing (cross-processing effect)
        // Boost greens and cyans, shift reds towards magenta
        const hsl = rgbToHsl(r, g, b)

        // Enhance saturation more aggressively
        hsl[1] = Math.min(1, hsl[1] * 1.4)

        // Shift hues for cross-processing look
        if (hsl[0] >= 0 && hsl[0] < 0.1) {
          // Reds -> more magenta
          hsl[0] = Math.max(0, hsl[0] - 0.05)
        } else if (hsl[0] >= 0.25 && hsl[0] < 0.75) {
          // Greens and cyans -> more vibrant
          hsl[1] = Math.min(1, hsl[1] * 1.6)
        }

        // Convert back to RGB
        let [chromaR, chromaG, chromaB] = hslToRgb(hsl[0], hsl[1], hsl[2])

        // Apply contrast boost
        const contrast = 1.25
        chromaR = Math.min(255, Math.max(0, (chromaR - 128) * contrast + 128))
        chromaG = Math.min(255, Math.max(0, (chromaG - 128) * contrast + 128))
        chromaB = Math.min(255, Math.max(0, (chromaB - 128) * contrast + 128))

        // Add subtle film grain
        chromaR = addFilmGrain(chromaR, x, y, 8)
        chromaG = addFilmGrain(chromaG, x, y, 8)
        chromaB = addFilmGrain(chromaB, x, y, 8)

        // Set the processed values
        data[i] = chromaR
        data[i + 1] = chromaG
        data[i + 2] = chromaB
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0)

      // Add light leaks overlay
      context.globalCompositeOperation = "screen"

      // Create multiple light leak effects
      const leaks = [
        { x: width * 0.1, y: height * 0.2, size: width * 0.3, color: "rgba(255, 180, 100, 0.4)" },
        { x: width * 0.8, y: height * 0.7, size: width * 0.25, color: "rgba(255, 120, 80, 0.3)" },
        { x: width * 0.05, y: height * 0.8, size: width * 0.2, color: "rgba(255, 200, 150, 0.35)" },
      ]

      leaks.forEach((leak) => {
        const gradient = context.createRadialGradient(leak.x, leak.y, 0, leak.x, leak.y, leak.size)
        gradient.addColorStop(0, leak.color)
        gradient.addColorStop(0.6, leak.color.replace(/0\.\d+\)$/, "0.1)"))
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

        context.fillStyle = gradient
        context.fillRect(0, 0, width, height)
      })

      // Add edge light leak
      context.globalCompositeOperation = "overlay"
      const edgeGradient = context.createLinearGradient(0, 0, width, 0)
      edgeGradient.addColorStop(0, "rgba(255, 160, 100, 0.2)")
      edgeGradient.addColorStop(0.3, "rgba(255, 160, 100, 0)")
      edgeGradient.addColorStop(1, "rgba(255, 160, 100, 0)")

      context.fillStyle = edgeGradient
      context.fillRect(0, 0, width, height)
    } else if (filterType === "red-light") {
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i]
        let g = data[i + 1]
        let b = data[i + 2]

        // Apply grayscale(100%)
        const gray = r * 0.299 + g * 0.587 + b * 0.114
        r = g = b = gray

        // Apply brightness(106%)
        r = Math.min(255, r * 1.06)
        g = Math.min(255, g * 1.06)
        b = Math.min(255, b * 1.06)

        // Set the processed values
        data[i] = r // R
        data[i + 1] = g // G
        data[i + 2] = b // B
        // Alpha channel (data[i + 3]) remains unchanged
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0)

      // Apply red overlay with multiply blend mode (#fa0000)
      context.globalCompositeOperation = "multiply"
      context.fillStyle = "rgba(250, 0, 0, 1)" // #fa0000 with 100% opacity
      context.fillRect(0, 0, width, height)
    }

    // Reset composite operation
    context.globalCompositeOperation = "source-over"
  }

  // Helper functions for HSL conversion
  const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0,
      s = 0,
      l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0)
          break
        case g:
          h = (b - r) / d + 2
          break
        case b:
          h = (r - g) / d + 4
          break
      }
      h /= 6
    }

    return [h, s, l]
  }

  const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    let r, g, b

    if (s === 0) {
      r = g = b = l
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

  // Function to start live filter preview
  const startLiveFilterPreview = () => {
    if (!videoRef.current || !liveCanvasRef.current) return

    const video = videoRef.current
    const canvas = liveCanvasRef.current
    const context = canvas.getContext("2d")

    if (!context) return

    // Explicitly set canvas dimensions to match the desired 3:4 aspect ratio
    // based on the max-w-sm (384px) of the parent Card.
    const desiredWidth = 224 // max-w-sm is 24rem = 384px
    const desiredHeight = (desiredWidth / 3) * 4 // 3:4 aspect ratio

    canvas.width = desiredWidth
    canvas.height = desiredHeight

    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    const drawFrame = () => {
      if (!video || !context || video.paused || video.ended) return

      // Calculate 3:4 aspect ratio dimensions for cropping
      const videoWidth = video.videoWidth
      const videoHeight = video.videoHeight
      const targetAspectRatio = 3 / 4

      let sourceWidth, sourceHeight, sourceX, sourceY

      if (videoWidth / videoHeight > targetAspectRatio) {
        // Video is wider than 3:4, crop width
        sourceHeight = videoHeight
        sourceWidth = videoHeight * targetAspectRatio
        sourceX = (videoWidth - sourceWidth) / 2
        sourceY = 0
      } else {
        // Video is taller than 3:4, crop height
        sourceWidth = videoWidth
        sourceHeight = videoWidth / targetAspectRatio
        sourceX = 0
        sourceY = (videoHeight - sourceHeight) / 2
      }

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height)

      // Draw the cropped video frame to canvas
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)

      // Apply filter
      applyFilterToCanvas(context, canvas.width, canvas.height, activeFilter)

      // Schedule next frame
      animationFrameRef.current = requestAnimationFrame(drawFrame)
    }

    // Start the animation
    drawFrame()
  }

  const capturePhoto = async () => {
    if (!liveCanvasRef.current || !canvasRef.current) return

    setIsCapturing(true)

    try {
      // We'll capture directly from the live canvas which already has the filter applied
      const liveCanvas = liveCanvasRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")

      if (!context) return

      // Set capture canvas to same dimensions as live canvas for consistent quality
      canvas.width = liveCanvas.width
      canvas.height = liveCanvas.height

      // Draw the current filtered frame from live canvas to capture canvas
      context.drawImage(liveCanvas, 0, 0)

      // Convert canvas to data URL for preview
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9)
      setCapturedPhoto(dataUrl)
      setIsCapturing(false)
    } catch (error) {
      console.error("Error capturing photo:", error)
      setIsCapturing(false)
    }
  }

  const downloadPhoto = async () => {
    if (!capturedPhoto) return

    try {
      // The capturedPhoto already contains the filtered and cropped image
      // Convert data URL to blob
      const response = await fetch(capturedPhoto)
      const blob = await response.blob()

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const filename = `camera-photo-${timestamp}.jpg`

      // Create file object
      const file = new File([blob], filename, { type: "image/jpeg" })

      // Check if Web Share API with files is supported (mobile devices)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Save Photo",
          text: "Save this photo to your device",
        })
      } else {
        // Fallback for devices that don't support Web Share API
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = filename

        // Trigger download
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        // Clean up
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error("Error saving photo:", error)
      // Fallback to regular download if sharing fails
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const filename = `camera-photo-${timestamp}.jpg`

      const link = document.createElement("a")
      link.href = capturedPhoto
      link.download = filename

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const clearPhoto = () => {
    setCapturedPhoto(null)
    // Restart the camera to show live feed again
    if (hasPermission) {
      startCamera()
    }
  }

  useEffect(() => {
    // Check if camera is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera not supported in this browser")
      return
    }

    // Clean up on unmount
    return () => {
      stopCamera()
    }
  }, [])

  // When facing mode changes, restart camera if it was active
  useEffect(() => {
    if (isActive) {
      startCamera()
    }
  }, [facingMode])

  // Restart live preview when filter changes or when video becomes active
  useEffect(() => {
    if (isActive && videoRef.current && videoRef.current.readyState >= 2) {
      startLiveFilterPreview()
    }
  }, [activeFilter, isActive])

  // Add a video event listener to ensure filter is applied as soon as video is playing
  useEffect(() => {
    const videoElement = videoRef.current

    if (videoElement) {
      const handlePlaying = () => {
        if (isActive && filterInitializedRef.current) {
          startLiveFilterPreview()
        }
      }

      videoElement.addEventListener("playing", handlePlaying)

      return () => {
        videoElement.removeEventListener("playing", handlePlaying)
      }
    }
  }, [isActive])

  return (
    <div className="w-full h-[95vh] flex items-center justify-center p-4 overflow-auto">
      <div className="flex flex-row items-center justify-center gap-8 p-4 h-full">
        {/* Filter Selection Buttons */}
        {hasPermission && isActive && !capturedPhoto && (
          <div
            className="flex flex-col items-center overflow-y-auto overflow-x-hidden p-6 flex-shrink-0"
            style={{
              gap: "75px",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              maxHeight: "calc(100% - 2rem)",
              width: "48px",
            }}
          >
            <style jsx>{`
            div::-webkit-scrollbar {
              display: none;
            }
          `}</style>
            <Button
              onClick={() => setActiveFilter("none")}
              size="sm"
              variant={activeFilter === "none" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              No Filter
            </Button>
            <Button
              onClick={() => setActiveFilter("pink")}
              size="sm"
              variant={activeFilter === "pink" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Pink
            </Button>
            <Button
              onClick={() => setActiveFilter("cyan")}
              size="sm"
              variant={activeFilter === "cyan" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Cyan
            </Button>
            <Button
              onClick={() => setActiveFilter("ilford")}
              size="sm"
              variant={activeFilter === "ilford" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Ilford B&W
            </Button>
            <Button
              onClick={() => setActiveFilter("fuji")}
              size="sm"
              variant={activeFilter === "fuji" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Fuji Disposable
            </Button>
            <Button
              onClick={() => setActiveFilter("polaroid")}
              size="sm"
              variant={activeFilter === "polaroid" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Polaroid
            </Button>
            <Button
              onClick={() => setActiveFilter("halation")}
              size="sm"
              variant={activeFilter === "halation" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Halation
            </Button>
            <Button
              onClick={() => setActiveFilter("css-filter")}
              size="sm"
              variant={activeFilter === "css-filter" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Cool Blue
            </Button>
            <Button
              onClick={() => setActiveFilter("chroma-leak")}
              size="sm"
              variant={activeFilter === "chroma-leak" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Chroma Leak
            </Button>
            <Button
              onClick={() => setActiveFilter("red-light")}
              size="sm"
              variant={activeFilter === "red-light" ? "default" : "outline"}
              className="text-xs whitespace-nowrap px-2 py-2 transform -rotate-90 origin-center flex items-center justify-center bg-white text-black border-black hover:bg-black hover:text-white rounded-none"
              style={{ width: "100px", height: "32px" }}
            >
              Red Light
            </Button>
          </div>
        )}

        {/* Main content area - Centered */}
        <div className="flex flex-col items-center overflow-y-hidden">
          {/* Viewfinder */}
          <Card className="w-full max-w-sm overflow-hidden flex-shrink-0">
            <CardContent className="p-0">
              <div className="relative aspect-[3/4] w-full bg-black">
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center text-white bg-black/80 p-4 text-center">
                    <p>{error}</p>
                  </div>
                )}

                {capturedPhoto ? (
                  <img
                    src={capturedPhoto || "/placeholder.svg"}
                    alt="Captured photo"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    {/* Hidden video element used as source */}
                    <video ref={videoRef} autoPlay playsInline muted className="hidden" />

                    {/* Canvas for live preview with filter */}
                    {isActive && <canvas ref={liveCanvasRef} className="w-full h-full object-cover" />}
                    {/* Hidden canvas for capturing photos */}
                    <canvas ref={canvasRef} className="hidden" />

                    {!isActive && !error && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black"></div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Control buttons */}
          <div className="flex gap-4 mt-6">
            {!capturedPhoto ? (
              <>
                <div className="relative">
                  <Button
                    onClick={toggleCamera}
                    size="lg"
                    className={`rounded-full w-16 h-16 flex items-center justify-center bg-white text-black border-2 ${isActive ? "border-green-500" : "border-black"} hover:bg-gray-100`}
                  >
                    <Power className="w-6 h-6" />
                    <span className="sr-only">{isActive ? "Stop Camera" : "Start Camera"}</span>
                  </Button>
                </div>

                {/* Capture Photo Button */}
                <Button
                  onClick={capturePhoto}
                  size="lg"
                  variant="default"
                  className={`rounded-full w-16 h-16 flex items-center justify-center bg-white text-black hover:bg-gray-100 ${
                    !hasPermission || !isActive ? "invisible" : ""
                  }`}
                  disabled={isCapturing || !hasPermission || !isActive}
                >
                  <Camera className="w-6 h-6" />
                  <span className="sr-only">Capture Photo</span>
                </Button>

                {/* Switch Camera Button */}
                {/*                   <Button
              onClick={switchCamera}
              size="lg"
              variant="outline"
              className={`rounded-full w-16 h-16 flex items-center justify-center ${
                !hasPermission || !isActive ? "invisible" : ""
              }`}
              disabled={!hasPermission || !isActive}
            >
              <FlipCamera className="w-6 h-6" />
              <span className="sr-only">Switch Camera</span>
            </Button> */}
              </>
            ) : (
              <>
                <Button
                  onClick={clearPhoto}
                  size="lg"
                  variant="outline"
                  className="rounded-full w-16 h-16 flex items-center justify-center"
                >
                  <X className="w-6 h-6" />
                  <span className="sr-only">Clear Photo</span>
                </Button>

                <Button
                  onClick={downloadPhoto}
                  size="lg"
                  variant="default"
                  className="rounded-full w-16 h-16 flex items-center justify-center bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-6 h-6" />
                  <span className="sr-only">Download Photo</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
