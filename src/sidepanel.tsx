import React, { useState, useEffect, useRef } from "react";
import ImagePreview from "./components/ImagePreview";
import PixelArtPreview from "./components/PixelArtPreview";
import ColorPalette from "./components/ColorPalette";
import { Button } from "./components/ui/button";
import { PALETTE, ColorInfo } from "./lib/palette";
import { FREE_PALETTE } from "./lib/freePalette";

// Define types for our state
interface PaletteColor {
  colorInfo: ColorInfo;
  isAvailable: boolean; // Auto-detected availability
  isSelected: boolean; // User selection
  count: number; // Pixel count for this color
}

// Helper function to convert RGB array to RGB string
const rgbArrayToString = (rgb: number[]): string => {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
};

const SidePanel = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [paletteColors, setPaletteColors] = useState<PaletteColor[]>([]);
  const [pixelArtDataUrl, setPixelArtDataUrl] = useState<string | null>(null);
  const [isPlacingOverlay, setIsPlacingOverlay] = useState(false);
  const [isPixelitLoaded, setIsPixelitLoaded] = useState(false);
  const [pixelScale, setPixelScale] = useState<number>(8); // Default scale value
  const [scaledImageDataUrl, setScaledImageDataUrl] = useState<string | null>(null); // 存储缩小并应用调色板处理后的图像数据
  // Remove isConverting state variable
  
  // Refs for DOM elements
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize palette colors
  useEffect(() => {
    // 使用免费调色板作为默认调色板
    console.log("FREE_PALETTE:", FREE_PALETTE);
    console.log("PALETTE:", PALETTE);
    
    const freePaletteStrings = FREE_PALETTE.map(rgbArrayToString);
    console.log("Free palette strings:", freePaletteStrings);
    
    const initialPaletteColors: PaletteColor[] = PALETTE
      .map(colorInfo => {
        const isFree = freePaletteStrings.includes(colorInfo.rgbValue);
        return {
          colorInfo,
          isAvailable: isFree, // Default to available only for free colors
          isSelected: isFree,  // 默认只选中免费颜色
          count: 0 // 默认计数为0
        };
      });
      
    console.log("Initial palette colors:", initialPaletteColors);
    setPaletteColors(initialPaletteColors);
    
    // Try to detect available colors
    detectAvailableColors();
    
    // Load pixelit library
    loadPixelitLibrary();
  }, []);

  // Compute a string of selected color names to use as a dependency for useEffect
  const selectedColorNames = paletteColors
    .filter(pc => pc.isSelected)
    .map(pc => pc.colorInfo.colorName)
    .join('-');
    
  // Convert image when file is selected, imageSrc changes, or selected colors change
  useEffect(() => {
    if (selectedFile && imageSrc && isPixelitLoaded) {
      // Use setTimeout to defer the execution to the next tick
      // This ensures that the state update is processed before convertImage runs
      const timer = setTimeout(() => {
        convertImage();
      }, 0);
      
      // Cleanup function to clear the timeout if the component unmounts or dependencies change
      return () => clearTimeout(timer);
    }
  }, [selectedFile, imageSrc, isPixelitLoaded, selectedColorNames]);

  const loadPixelitLibrary = () => {
    // Check if Pixelit is already available
    if (typeof window !== 'undefined' && (window as any).pixelit) {
      setIsPixelitLoaded(true);
      return;
    }

    // Create script element
    const script = document.createElement('script');
    script.src = 'pixelit.js';  // Use pixelit.js instead of pixelit.min.js
    script.async = true;
    script.onload = () => {
      console.log('Pixelit library loaded');
      setIsPixelitLoaded(true);
    };
    script.onerror = () => {
      console.error('Failed to load Pixelit library');
    };
    
    document.head.appendChild(script);
  };

  // State to prevent multiple simultaneous requests
  const [isDetectingColors, setIsDetectingColors] = useState(false);

  const detectAvailableColors = () => {
    // Prevent multiple simultaneous requests
    if (isDetectingColors) {
      console.log("Already detecting colors, skipping request");
      return;
    }
    
    console.log("Detecting available colors...");
    setIsDetectingColors(true);
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        // Add a small delay to ensure the page is fully loaded
        setTimeout(() => {
          chrome.tabs.sendMessage(
            activeTab.id!,
            { action: "getAvailableColors" },
            (response) => {
              // Reset the flag when request is completed
              setIsDetectingColors(false);
              
              if (chrome.runtime.lastError) {
                console.error("Error detecting colors:", chrome.runtime.lastError.message || chrome.runtime.lastError);
                
                // Fallback to free palette if there's an error
                console.log("Falling back to free palette");
                resetToFreePalette();
                return;
              }
              
              if (response && response.availableColors) {
                console.log("Available colors from content script:", response.availableColors);
                // Check if available colors array is empty
                if (response.availableColors.length === 0) {
                  console.log("Available colors array is empty, falling back to free palette");
                  // Reset to free palette - set free colors as available and selected, others as unavailable and unselected
                  const freePaletteStrings = FREE_PALETTE.map(rgbArrayToString);
                  setPaletteColors(prevColors => {
                    const updatedColors = prevColors.map(pc => {
                      const isFree = freePaletteStrings.includes(pc.colorInfo.rgbValue);
                      return {
                        ...pc,
                        isAvailable: isFree,
                        isSelected: isFree
                      };
                    });
                    console.log("Reset palette colors to free palette:", updatedColors);
                    return updatedColors;
                  });
                } else {
                  const availableRgbSet = new Set(response.availableColors);
                  
                  setPaletteColors(prevColors => {
                    const updatedColors = prevColors.map(pc => {
                      const isAvailable = availableRgbSet.has(pc.colorInfo.rgbValue);
                      console.log(`Color ${pc.colorInfo.colorName} (${pc.colorInfo.rgbValue}) is available: ${isAvailable}`);
                      
                      if (isAvailable) {
                        // If color is available, set it as available and selected
                        return {
                          ...pc,
                          isAvailable: true,
                          isSelected: true
                        };
                      } else {
                        // If color is not available, set it as unavailable and unselected
                        return {
                          ...pc,
                          isAvailable: false,
                          isSelected: false
                        };
                      }
                    });
                    console.log("Updated palette colors:", updatedColors);
                    return updatedColors;
                  });
                }
              } else {
                console.log("No available colors returned from content script");
                // Fallback to free palette if no available colors are returned
                resetToFreePalette();
              }
            }
          );
        }, 500); // 500ms delay
      } else {
        console.warn("No active tab found or tab ID is missing");
        // Reset the flag when request is completed
        setIsDetectingColors(false);
        // Fallback to free palette if no active tab
        resetToFreePalette();
      }
    });
  };
  
  // Helper function to reset to free palette
  const resetToFreePalette = () => {
    console.log("Resetting to free palette");
    const freePaletteStrings = FREE_PALETTE.map(rgbArrayToString);
    console.log("Free palette strings:", freePaletteStrings);
    
    setPaletteColors(prevColors => {
      const updatedColors = prevColors.map(pc => {
        const isFree = freePaletteStrings.includes(pc.colorInfo.rgbValue);
        return {
          ...pc,
          isSelected: isFree // Only reset selection to free colors, keep isAvailable unchanged
        };
      });
      console.log("Reset palette colors:", updatedColors);
      return updatedColors;
    });
  };
  
  // Function to handle refresh button click
  const handleRefresh = () => {
    console.log("Refresh button clicked, detecting available colors...");
    // Instead of just resetting to free palette, actually detect available colors
    detectAvailableColors();
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    
    // Create a preview URL for the image
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string);
      // Immediately convert the image when a new file is selected
      if (isPixelitLoaded) {
        convertImage();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleColorToggle = (colorName: string) => {
    setPaletteColors(prevColors => 
      prevColors.map(pc => 
        pc.colorInfo.colorName === colorName 
          ? { ...pc, isSelected: !pc.isSelected } 
          : pc
      )
    );
    // Convert the image when color selection changes
    if (selectedFile && imageSrc && isPixelitLoaded) {
      convertImage();
    }
  };

  const handleDeselectAll = () => {
    setPaletteColors(prevColors => 
      prevColors.map(pc => ({ 
        ...pc, 
        isSelected: pc.colorInfo.colorName === "White" // Default to white when deselecting all
      }))
    );
  };

  const areAllSelected = paletteColors.every(pc => pc.isSelected || pc.colorInfo.rgbValue === "undefined");

  const handleSelectAll = () => {
    setPaletteColors(prevColors => 
      prevColors.map(pc => ({ 
        ...pc, 
        isSelected: pc.colorInfo.rgbValue !== "undefined" // Exclude transparent color
      }))
    );
  };

  const convertImage = () => {
    if (!imageSrc || !imageRef.current || !canvasRef.current || !isPixelitLoaded) {
      return;
    }

    // 确保图像已经加载
    if (!imageRef.current.complete || imageRef.current.naturalWidth === 0) {
      console.log("Image not fully loaded yet, waiting...");
      return;
    }

    try {
      // 设置画布尺寸与图像尺寸相同
      canvasRef.current.width = imageRef.current.naturalWidth;
      canvasRef.current.height = imageRef.current.naturalHeight;

      // Log all palette colors and their selection status
      console.log("All palette colors:", paletteColors.map(pc => ({
        name: pc.colorInfo.colorName,
        rgb: pc.colorInfo.rgbValue,
        isSelected: pc.isSelected
      })));

      // Get selected colors for the palette
      const selectedPalette = paletteColors
        .filter(pc => pc.isSelected)
        .map(pc => pc.colorInfo.rgbValue)
        .filter(rgb => rgb !== "undefined") // Exclude transparent
        .map(rgbString => {
          // Convert "rgb(r, g, b)" string to [r, g, b] array
          const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (match) {
            return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          }
          // Fallback: return black if parsing fails
          console.warn("Failed to parse RGB string:", rgbString);
          return [0, 0, 0];
        });

      console.log("Selected palette for pixelit:", selectedPalette);

      // Get the pixelit constructor/function
      let PixelitClass;
      // @ts-ignore
      if (typeof (window as any).pixelit === 'function') {
        // @ts-ignore
        PixelitClass = (window as any).pixelit;
      } 
      // @ts-ignore
      else if ((window as any).Pixelit && typeof (window as any).Pixelit === 'function') {
        // @ts-ignore
        PixelitClass = (window as any).Pixelit;
      }
      // @ts-ignore
      else if ((window as any).Pixelit && typeof (window as any).Pixelit.Pixelit === 'function') {
        // @ts-ignore
        PixelitClass = (window as any).Pixelit.Pixelit;
      }
      
      if (typeof PixelitClass !== 'function') {
        console.error('pixelit is not a constructor. window.Pixelit:', (window as any).Pixelit, 'window.pixelit:', (window as any).pixelit);
        return;
      }

      // Custom pixelation logic without using pixelit.js
      // Step 1: Pixelate the image by scaling down
      // Create a temporary canvas for scaling down
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      
      // Disable image smoothing for pixel-perfect scaling
      (tempCtx as any).mozImageSmoothingEnabled = false;
      (tempCtx as any).webkitImageSmoothingEnabled = false;
      tempCtx.imageSmoothingEnabled = false;
      
      // Calculate scaled dimensions
      const scaledWidth = Math.max(1, Math.round(imageRef.current.naturalWidth * pixelScale * 0.01));
      const scaledHeight = Math.max(1, Math.round(imageRef.current.naturalHeight * pixelScale * 0.01));
      
      // Set temp canvas dimensions
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      
      // Draw scaled down image
      tempCtx.drawImage(imageRef.current, 0, 0, scaledWidth, scaledHeight);
      
      // Step 2: Apply color palette conversion to the scaled down image
      const scaledImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const scaledData = scaledImageData.data;
      
      // Function to calculate color similarity
      const colorSim = (rgbColor: number[], compareColor: number[]): number => {
        let d = 0;
        for (let i = 0; i < rgbColor.length; i++) {
          d += (rgbColor[i] - compareColor[i]) * (rgbColor[i] - compareColor[i]);
        }
        return Math.sqrt(d);
      };
      
      // Function to find the most similar color in the palette
      const similarColor = (actualColor: number[]): number[] => {
        if (selectedPalette.length === 0) return actualColor;
        
        let selectedColor = selectedPalette[0];
        let currentSim = colorSim(actualColor, selectedPalette[0]);
        
        for (const color of selectedPalette) {
          const nextColor = colorSim(actualColor, color);
          if (nextColor <= currentSim) {
            selectedColor = color;
            currentSim = nextColor;
          }
        }
        return selectedColor;
      };
      
      // Apply palette conversion to each pixel in the scaled image
      for (let y = 0; y < scaledImageData.height; y++) {
        for (let x = 0; x < scaledImageData.width; x++) {
          const i = y * 4 * scaledImageData.width + x * 4;
          const r = scaledData[i];
          const g = scaledData[i + 1];
          const b = scaledData[i + 2];
          const a = scaledData[i + 3];
          
          // Skip transparent pixels
          if (a === 0) continue;
          
          // Find the most similar color in the palette
          const originalColor = [r, g, b];
          const finalColor = similarColor(originalColor);
          
          // Apply the final color
          scaledData[i] = finalColor[0];
          scaledData[i + 1] = finalColor[1];
          scaledData[i + 2] = finalColor[2];
          console.log("Original color:", originalColor, "Final color:", finalColor);
        }
      }

      // DEBUG: 验证调色盘转换后颜色是否在调色盘范围内
      console.log("=== 调色盘转换后颜色验证 ===");
      const paletteColorsSet = new Set(selectedPalette.map(color => `rgb(${color[0]},${color[1]},${color[2]})`));
      let hasOutOfPaletteColors = false;
      
      for (let y = 0; y < scaledImageData.height; y++) {
        for (let x = 0; x < scaledImageData.width; x++) {
          const i = y * 4 * scaledImageData.width + x * 4;
          const r = scaledData[i];
          const g = scaledData[i + 1];
          const b = scaledData[i + 2];
          const a = scaledData[i + 3];

          // Skip transparent pixels
          if (a === 0) continue;

          const colorStr = `rgb(${r},${g},${b})`;
          if (!paletteColorsSet.has(colorStr)) {
            console.warn(`发现调色盘外颜色 at (${x},${y}): ${colorStr}`);
            hasOutOfPaletteColors = true;
          }
        }
      }
      
      if (!hasOutOfPaletteColors) {
        console.log("✓ 所有颜色都在调色盘范围内");
      }
      
      // Put the modified image data back to the temp canvas
      tempCtx.putImageData(scaledImageData, 0, 0);

      // DEBUG: 验证putImageData后颜色是否一致
      console.log("=== putImageData后颜色验证 ===");
      const verifyImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const verifyData = verifyImageData.data;
      
      let putImageDataConsistent = true;
      for (let i = 0; i < Math.min(20, scaledData.length); i += 4) {
        if (scaledData[i] !== verifyData[i] || 
            scaledData[i+1] !== verifyData[i+1] || 
            scaledData[i+2] !== verifyData[i+2] || 
            scaledData[i+3] !== verifyData[i+3]) {
          console.warn(`putImageData后颜色不一致 at index ${i/4}: 
Expected: rgb(${scaledData[i]},${scaledData[i+1]},${scaledData[i+2]},${scaledData[i+3]})
Actual: rgb(${verifyData[i]},${verifyData[i+1]},${verifyData[i+2]},${verifyData[i+3]})`);
          putImageDataConsistent = false;
          break;
        }
      }
      
      if (putImageDataConsistent) {
        console.log("✓ putImageData后颜色一致");
      }

      // 获取缩小并应用调色板处理后的图像数据 URL
      const scaledImageDataUrl = tempCanvas.toDataURL();
      
      // 创建另一个临时画布来保存缩小但未调色的图像数据
      const unscaledTempCanvas = document.createElement('canvas');
      const unscaledTempCtx = unscaledTempCanvas.getContext('2d');
      if (!unscaledTempCtx) return;
      
      // 设置画布尺寸与缩小后的图像相同
      unscaledTempCanvas.width = scaledWidth;
      unscaledTempCanvas.height = scaledHeight;
      
      // 在缩小但未调色的画布上绘制原始缩小图像
      unscaledTempCtx.drawImage(tempCanvas, 0, 0);
      
      // 获取缩小但未调色的图像数据 URL
      const unscaledImageDataUrl = unscaledTempCanvas.toDataURL();
      
      // Step 3: Scale back up to original size by manually expanding each pixel
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      // Calculate the upscale ratio
      const upscaleRatioX = imageRef.current.naturalWidth / scaledWidth;
      const upscaleRatioY = imageRef.current.naturalHeight / scaledHeight;
      
      // Set canvas dimensions to match original image
      canvasRef.current.width = imageRef.current.naturalWidth;
      canvasRef.current.height = imageRef.current.naturalHeight;
      
      // Clear main canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Manually expand each pixel from the scaled image
      for (let y = 0; y < scaledHeight; y++) {
        for (let x = 0; x < scaledWidth; x++) {
          const i = y * 4 * scaledWidth + x * 4;
          const r = scaledData[i];
          const g = scaledData[i + 1];
          const b = scaledData[i + 2];
          const a = scaledData[i + 3];
          
          // Skip transparent pixels
          if (a === 0) continue;
          
          // Calculate the position and size of the expanded pixel using precise calculation
          const pixelX = Math.floor(x * upscaleRatioX);
          const pixelY = Math.floor(y * upscaleRatioY);
          const nextPixelX = Math.floor((x + 1) * upscaleRatioX);
          const nextPixelY = Math.floor((y + 1) * upscaleRatioY);
          const pixelWidth = nextPixelX - pixelX;
          const pixelHeight = nextPixelY - pixelY;
          
          // DEBUG: 检查Canvas状态
          if (x === 0 && y === 0) {  // 只检查第一个像素以减少日志
            console.log("=== fillRect前Canvas状态 ===");
            console.log("  globalAlpha:", ctx.globalAlpha);
            console.log("  globalCompositeOperation:", ctx.globalCompositeOperation);
            console.log("  imageSmoothingEnabled:", ctx.imageSmoothingEnabled);
            console.log("  fillStyle:", ctx.fillStyle);
          }

          // Fill the expanded pixel
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
          
          // DEBUG: 检查绘制后的颜色
          if (x === 0 && y === 0) {  // 只检查第一个像素以减少日志
            try {
              const imageData = ctx.getImageData(pixelX, pixelY, 1, 1);
              const data = imageData.data;
              console.log("=== fillRect后实际颜色 ===");
              console.log(`  期望颜色: rgb(${r},${g},${b})`);
              console.log(`  实际颜色: rgb(${data[0]},${data[1]},${data[2]})`);
              if (data[0] !== r || data[1] !== g || data[2] !== b) {
                console.warn("  颜色发生变化!");
              }
            } catch (e: unknown) {
              console.log("  无法读取像素颜色:", (e as Error).message);
            }
          }
        }
      }
      
      // 获取颜色统计信息
      // 使用 Canvas API 直接获取颜色统计信息
      const colorCount = new Map<string, number>();
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const w = canvasRef.current.width;
          const h = canvasRef.current.height;
          const imgPixels = ctx.getImageData(0, 0, w, h);
          
          // DEBUG: 验证颜色统计来源
          console.log("=== 颜色统计来源验证 ===");
          console.log(`  Canvas尺寸: ${w}x${h}`);
          console.log(`  像素总数: ${imgPixels.width * imgPixels.height}`);
          
          // 验证调色盘
          const paletteColorsSet = new Set(selectedPalette.map(color => `rgb(${color[0]},${color[1]},${color[2]})`));
          
          for (let y = 0; y < imgPixels.height; y++) {
            for (let x = 0; x < imgPixels.width; x++) {
              const i = y * 4 * imgPixels.width + x * 4;
              const r = imgPixels.data[i];
              const g = imgPixels.data[i + 1];
              const b = imgPixels.data[i + 2];
              const a = imgPixels.data[i + 3];
              
              // Skip transparent pixels
              if (a === 0) continue;
              
              const color = `rgb(${r},${g},${b})`;
              const currentCount = colorCount.get(color) || 0;
              colorCount.set(color, currentCount + 1);
              
              // DEBUG: 检查是否有调色盘外颜色
              if (!paletteColorsSet.has(color) && x < 5 && y < 5) {  // 只检查前几个像素以减少日志
                console.warn(`发现调色盘外颜色 at (${x},${y}): ${color}`);
              }
            }
          }
          
          console.log(`  检测到 ${colorCount.size} 种颜色`);
        }
      }
        
      // 确保在获取数据 URL 之前画布已更新
      // 使用 requestAnimationFrame 确保浏览器完成渲染
      requestAnimationFrame(() => {
        // Check if canvasRef.current is not null before accessing its properties
        if (canvasRef.current) {
          // Get the result
          const dataUrl = canvasRef.current.toDataURL();
          setPixelArtDataUrl(dataUrl);
          // 存储缩小并应用调色板处理后的图像数据
          setScaledImageDataUrl(scaledImageDataUrl);
        }
        
        // 将缩小但未调色的图像数据存储到状态中
        (window as any).unscaledImageDataUrl = unscaledImageDataUrl;
        
        // 发送颜色统计信息到content script
        const colorCounts: { [color: string]: number } = {};
        colorCount.forEach((count: number, color: string) => {
          colorCounts[color] = count;
        });
        
        // 不再计算颜色统计，让Content Script自己计算
      });
    } catch (error) {
      console.error("Error converting image:", error);
      // TODO: Show user-friendly error message
    }
  };

  const handlePlaceOverlay = () => {
    if (!pixelArtDataUrl) return;
    
    setIsPlacingOverlay(true);
    
    // 不再从window对象获取颜色统计信息
    const colorCounts = {}; // 空对象，让Content Script自己计算
    
    // Get selected colors for the palette
    const selectedPalette = paletteColors
      .filter(pc => pc.isSelected)
      .map(pc => pc.colorInfo.rgbValue)
      .filter(rgb => rgb !== "undefined") // Exclude transparent
      .map(rgbString => {
        // Convert "rgb(r, g, b)" string to [r, g, b] array
        const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        }
        // Fallback: return black if parsing fails
        console.warn("Failed to parse RGB string:", rgbString);
        return [0, 0, 0];
      });
    
    // Send message to content script to prepare for overlay placement
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        chrome.tabs.sendMessage(
          activeTab.id,
          { 
            action: "prepareForOverlayPlacement",
            pixelArtDataUrl: pixelArtDataUrl,
            scaledImageDataUrl: scaledImageDataUrl, // 使用scaledImageDataUrl中存储的图像数据
            unscaledImageDataUrl: (window as any).unscaledImageDataUrl, // 添加缩小但未调色的图像数据
            // 不再传输colorCounts，让Content Script自己计算
            pixelScale: pixelScale,  // Add pixelScale to the message
            palette: selectedPalette,  // Add selected palette to the message
            originalImageWidth: imageRef.current?.naturalWidth || 0,  // Add original image width
            originalImageHeight: imageRef.current?.naturalHeight || 0  // Add original image height
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error preparing for overlay placement:", chrome.runtime.lastError.message || chrome.runtime.lastError);
              setIsPlacingOverlay(false);
              return;
            }
            
            console.log("Content script is ready for overlay placement");
          }
        );
      }
    });
  };

  // Helper function to get color name from RGB value
  const getColorName = (rgbValue: string): string => {
    const color = PALETTE.find(c => c.rgbValue === rgbValue);
    return color ? color.colorName : "Unknown";
  };

  return (
    <div className="h-screen w-full max-w-[min(100vw,1200px)] bg-gray-100 p-4 flex flex-col">
      {/* Hidden elements for pixelit processing */}
      <img 
        ref={imageRef} 
        src={imageSrc || ""} 
        alt="For processing" 
        className="hidden" 
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {
        <div className="flex-1 overflow-y-auto">
          <PixelArtPreview 
            pixelArtDataUrl={pixelArtDataUrl}
            pixelScale={pixelScale}
            onScaleChange={(scale) => {
              setPixelScale(scale);
              // Reconvert the image when scale changes
              if (selectedFile && imageSrc && isPixelitLoaded) {
                setTimeout(() => {
                  convertImage();
                }, 0);
              }
            }}
            onFileSelect={handleFileSelect}
            onReupload={() => {
              // Reset the file selection to allow re-uploading the same file
              setSelectedFile(null);
              setImageSrc(null);
              setPixelArtDataUrl(null);
              // Trigger file input click
              setTimeout(() => {
                const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
                if (fileInput) {
                  fileInput.click();
                }
              }, 0);
            }}
            onPlaceOverlay={handlePlaceOverlay} // Add this new prop
          />
          
          {/* Color Palette */}
          <div>
            <ColorPalette 
              colors={paletteColors} 
              onColorToggle={handleColorToggle}
              onRefreshPalette={handleRefresh}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              areAllSelected={areAllSelected}
            />
          </div>
        </div>
      }
    </div>
  );
};

export default SidePanel;