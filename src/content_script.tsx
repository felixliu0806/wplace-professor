// Extend HTMLDivElement interface to include our custom properties
interface HTMLDivElement {
  __saveButton?: HTMLButtonElement;
  __downloadButton?: HTMLButtonElement;
  __socialButtonsContainer?: HTMLDivElement;
  __listContainer?: HTMLDivElement;
}

// State for the overlay and color panel
let overlayElement: HTMLDivElement | null = null;
let controlPanelElement: HTMLDivElement | null = null;
let colorPanelElement: HTMLDivElement | null = null;
let pixelArtDataUrl: string | null = null;
let colorCounts: { [color: string]: number } = {};
let scaledRef: string | null = null; // 新增的scaledRef属性

// State for the save locations panel
let saveLocationsPanelElement: HTMLDivElement | null = null;

// Keep track of whether the listener is already set up
let isListenerSetUp = false;

// Track active drag operations to prevent event listener leaks
let activeControlPanelDragListeners = false;
let activeLocationPanelDragListeners = false;

// Constants for localStorage
const SAVE_LOCATIONS_KEY = 'wplace_professor_save_locations';
const PANEL_STATE_KEY = 'wplace_professor_panel_state'; // 新增的面板状态键
const CONTROL_PANEL_STATE_KEY = 'wplace_professor_control_panel_state'; // Control面板状态键
const MAX_NAME_LENGTH = 10;

// Type definition for saved locations
interface SavedLocation {
  id: string;
  name: string;
  timestamp: number;
  url: string;
}

// Function to detect available colors on wplace.live
const detectAvailableColors = (): string[] => {
  try {
    if (__DEV__) {
      console.log('Detecting available colors...');
    }

    // Directly look for the grid container with specific classes
    const gridContainer = document.querySelector('div.md\\:grid-cols-16.min-\\[100rem\\]\\:grid-cols-32.grid.grid-cols-8.xl\\:grid-cols-32.sm\\:grid-cols-16.gap-0\\.5.sm\\:gap-1');

    if (gridContainer) {
      if (__DEV__) {
        console.log('Found grid container');
      }

      // If grid container is found, get all color buttons from it
      const colorButtons = gridContainer.querySelectorAll('button[style*="background"]');
      if (__DEV__) {
        console.log('Found color buttons:', colorButtons.length);
      }

      const availableColors: string[] = [];

      colorButtons.forEach((button, index) => {
        // Check if the button has a lock icon (svg with specific class or path)
        const lockIcon = button.querySelector('svg');
        if (!lockIcon) {
          // No lock icon means it's available
          const style = button.getAttribute('style');
          if (style) {
            const rgbMatch = style.match(/background:\s*(rgb\(\d+,\s*\d+,\s*\d+\))/);
            if (rgbMatch) {
              availableColors.push(rgbMatch[1]);
              if (__DEV__) {
                console.log(`Button ${index}: Found color ${rgbMatch[1]}`);
              }
            } else {
              if (__DEV__) {
                console.log(`Button ${index}: No color match in style:`, style);
              }
            }
          } else {
            if (__DEV__) {
              console.log(`Button ${index}: No style attribute`);
            }
          }
        } else {
          if (__DEV__) {
            console.log(`Button ${index}: Locked (has lock icon)`);
          }
        }
      });

      if (__DEV__) {
        console.log('Detected available colors:', availableColors);
      }
      return availableColors;
    } else {
      if (__DEV__) {
        console.log('Grid container not found');
      }
      // Let's try to find any grid container as fallback
      const anyGridContainer = document.querySelector('div.grid');
      if (anyGridContainer) {
        if (__DEV__) {
          console.log('Found a grid container (fallback):', anyGridContainer);
        }
        // Try to get color buttons from this fallback container
        const colorButtons = anyGridContainer.querySelectorAll('button[style*="background"]');
        if (__DEV__) {
          console.log('Found color buttons (fallback):', colorButtons.length);
        }

        const availableColors: string[] = [];
        colorButtons.forEach((button, index) => {
          // Check if the button has a lock icon (svg with specific class or path)
          const lockIcon = button.querySelector('svg');
          if (!lockIcon) {
            // No lock icon means it's available
            const style = button.getAttribute('style');
            if (style) {
              const rgbMatch = style.match(/background:\s*(rgb\(\d+,\s*\d+,\s*\d+\))/);
              if (rgbMatch) {
                availableColors.push(rgbMatch[1]);
                if (__DEV__) {
                  console.log(`Button ${index}: Found color ${rgbMatch[1]} (fallback)`);
                }
              } else {
                if (__DEV__) {
                  console.log(`Button ${index}: No color match in style (fallback):`, style);
                }
              }
            } else {
              if (__DEV__) {
                console.log(`Button ${index}: No style attribute (fallback)`);
              }
            }
          } else {
            if (__DEV__) {
              console.log(`Button ${index}: Locked (has lock icon) (fallback)`);
            }
          }
        });

        if (__DEV__) {
          console.log('Detected available colors (fallback):', availableColors);
        }
        return availableColors;
      } else {
        if (__DEV__) {
          console.log('No grid container found at all');
        }
      }
    }

    // Fallback: If specific container or grid container is not found, 
    // or if we want to default to free palette, return an empty array
    // The SidePanel will handle the fallback to free palette
    if (__DEV__) {
      console.log('Grid container not found, returning empty array for fallback to free palette');
    }
    return [];
  } catch (error) {
    if (__DEV__) {
      console.error('Error detecting available colors:', error);
    }
    return [];
  }
};

// Function to calculate color similarity
const colorSim = (rgbColor: number[], compareColor: number[]): number => {
  let d = 0;
  for (let i = 0; i < rgbColor.length; i++) {
    d += (rgbColor[i] - compareColor[i]) * (rgbColor[i] - compareColor[i]);
  }
  return Math.sqrt(d);
};

// Function to find the most similar color in the palette
const similarColor = (actualColor: number[], selectedPalette: number[][]): number[] => {
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

// Function to draw a pixel block with border, padding, and center color
const drawPixelBlock = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  blockSize: number,
  color: string,
  drawCenter: boolean = true, // Add parameter to control center color drawing
  opacity: number = 1.0 // Add parameter to control opacity
) => {
  // Draw the outer border (thin line) - always visible
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, blockSize, blockSize);

  // If we're not drawing the center, we're done (only show the border)
  if (!drawCenter) {
    return;
  }

  // For very small blocks, just fill with the color if drawing center
  if (blockSize <= 3) {
    // Apply alpha for transparency
    const originalFillStyle = ctx.fillStyle;
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = rgbMatch[1];
      const g = rgbMatch[2];
      const b = rgbMatch[3];
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    } else {
      ctx.fillStyle = color;
    }
    ctx.fillRect(x, y, blockSize, blockSize);
    // Restore original fill style
    ctx.fillStyle = originalFillStyle;
    return;
  }

  // Calculate padding (25% of blockSize for padding on each side to make border more visible)
  const padding = Math.max(1, Math.floor(blockSize * 0.25));

  // Draw the inner area (padding area) in white or light gray
  const innerX = x + padding;
  const innerY = y + padding;
  const innerSize = blockSize - padding * 2;

  if (innerSize > 0) {
    ctx.fillStyle = '#f0f0f0'; // Light gray for padding area
    ctx.fillRect(innerX, innerY, innerSize, innerSize);

    // Draw the center color area (50% of blockSize) only if drawCenter is true
    const centerPadding = Math.max(1, Math.floor(blockSize * 0.3)); // 30% padding for center area
    const centerX = x + centerPadding;
    const centerY = y + centerPadding;
    const centerSize = blockSize - centerPadding * 2;

    if (centerSize > 0) {
      // Apply alpha for transparency
      const originalFillStyle = ctx.fillStyle;
      const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const r = rgbMatch[1];
        const g = rgbMatch[2];
        const b = rgbMatch[3];
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      } else {
        ctx.fillStyle = color;
      }
      ctx.fillRect(centerX, centerY, centerSize, centerSize);
      // Restore original fill style
      ctx.fillStyle = originalFillStyle;
    }
  }
};

// Function to redraw canvas with color blocks and borders
const redrawCanvasWithColorBlocks = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, img: HTMLImageElement, pixelScale: number, scale: number, colorFilter: string | null = null) => {
  // Get palette and original image dimensions from window object
  const palette = (window as any).currentPalette || [];
  const originalImageWidth = (window as any).originalImageWidth || img.naturalWidth;
  const originalImageHeight = (window as any).originalImageHeight || img.naturalHeight;
  const scaledImageDataUrl = (window as any).currentScaledImageDataUrl || null;
  const unscaledImageDataUrl = (window as any).currentUnscaledImageDataUrl || null;

  // Always use unscaled image data for color conversion if available, otherwise use scaled image data for display
  const imageDataUrl = unscaledImageDataUrl || scaledImageDataUrl;
  if (!imageDataUrl) {
    if (__DEV__) {
      console.error("No image data URL available");
    }
    return;
  }

  // Load the image data
  const scaledImg = new Image();
  scaledImg.onload = function () {
    // Create a temporary canvas for processing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Draw the scaled image
    tempCanvas.width = scaledImg.naturalWidth;
    tempCanvas.height = scaledImg.naturalHeight;
    tempCtx.drawImage(scaledImg, 0, 0);

    // Get image data
    const scaledImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const scaledData = scaledImageData.data;

    // If we have unscaled image data, apply color palette conversion
    if (unscaledImageDataUrl) {
      // Function to convert "rgb(r, g, b)" string to [r, g, b] array
      const rgbStringToArray = (rgbString: string): number[] => {
        const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        }
        // Fallback: return black if parsing fails
        if (__DEV__) {
          console.warn("Failed to parse RGB string:", rgbString);
        }
        return [0, 0, 0];
      };

      // Get selected palette for color conversion
      // palette is already an array of RGB arrays, use it directly
      const selectedPalette = palette;

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
          const finalColor = similarColor(originalColor, selectedPalette);

          // Apply the final color
          scaledData[i] = finalColor[0];
          scaledData[i + 1] = finalColor[1];
          scaledData[i + 2] = finalColor[2];
        }
      }

      // Put the modified image data back to the temp canvas
      tempCtx.putImageData(scaledImageData, 0, 0);
    }

    // Now draw each pixel as a block with border, padding, and center color
    // Create another temporary canvas for the block drawing
    const blockCanvas = document.createElement('canvas');
    const blockCtx = blockCanvas.getContext('2d');
    if (!blockCtx) return;

    // blockSize is the size of each pixel block in the final display
    // It's the ratio between original and scaled dimensions
    const pixelWidthRatio = originalImageWidth / scaledImg.naturalWidth;
    const blockSize = Math.round(pixelWidthRatio * scale);

    blockCanvas.width = Math.round(originalImageWidth * scale);
    blockCanvas.height = Math.round(originalImageHeight * scale);

    // Draw each pixel as a block, optionally filtered by color
    for (let y = 0; y < scaledImg.naturalHeight; y++) {
      for (let x = 0; x < scaledImg.naturalWidth; x++) {
        const i = y * 4 * scaledImg.naturalWidth + x * 4;
        const r = scaledData[i];
        const g = scaledData[i + 1];
        const b = scaledData[i + 2];
        const a = scaledData[i + 3];

        // Skip transparent pixels
        if (a === 0) continue;

        const color = `rgb(${r},${g},${b})`;

        // Draw pixel block with border, padding, and center color
        const blockX = x * blockSize;
        const blockY = y * blockSize;

        // If a color filter is applied, only draw the center for matching colors
        // For non-matching colors, we make them completely transparent (don't draw center)
        const drawCenter = !colorFilter || color === colorFilter;
        drawPixelBlock(blockCtx, blockX, blockY, blockSize, color, drawCenter, 1.0);
      }
    }

    // Removed: Draw border around the entire image
    // blockCtx.strokeStyle = '#000000';
    // blockCtx.lineWidth = 2;
    // blockCtx.strokeRect(0, 0, blockCanvas.width, blockCanvas.height);

    // Copy the block image to the main canvas
    canvas.width = blockCanvas.width;
    canvas.height = blockCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(blockCanvas, 0, 0);
  };
  scaledImg.src = imageDataUrl;
  return;
};

// Function to create color panel
const createColorPanel = (colorCounts: { [key: string]: number } | null, pixelScale: number) => {
  // Remove existing color panel if any
  // Remove the wrapper if it exists in the DOM
  const existingWrapper = document.getElementById('wplace-professor-color-panel-wrapper');
  if (existingWrapper) {
    existingWrapper.remove();
  }

  // If colorCounts is null, we need to calculate it from the scaled image data
  if (!colorCounts) {
    // Get the scaled image data URL from window object
    const scaledImageDataUrl = (window as any).currentScaledImageDataUrl;
    if (!scaledImageDataUrl) {
      if (__DEV__) {
        console.error("No scaled image data URL available for color counting");
      }
      return;
    }

    // Load the scaled image and calculate color counts
    const scaledImg = new Image();
    scaledImg.onload = function () {
      // Create a temporary canvas for processing
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      // Draw the scaled image
      tempCanvas.width = scaledImg.naturalWidth;
      tempCanvas.height = scaledImg.naturalHeight;

      // DEBUG: 检查Canvas设置
      if (__DEV__) {
        console.log("=== Content Script Canvas设置 ===");
        console.log("  Canvas尺寸:", tempCanvas.width, "x", tempCanvas.height);
        console.log("  imageSmoothingEnabled:", tempCtx.imageSmoothingEnabled);
        console.log("  globalAlpha:", tempCtx.globalAlpha);
        console.log("  globalCompositeOperation:", tempCtx.globalCompositeOperation);
      }

      tempCtx.drawImage(scaledImg, 0, 0);

      // DEBUG: 验证绘制后的Canvas内容
      if (__DEV__) {
        console.log("=== 绘制后Canvas验证 ===");
        const verifyImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const verifyData = verifyImageData.data;
        console.log(`  验证数据长度: ${verifyData.length}`);

        // 统计前100个像素的颜色
        const sampleColors = new Set<string>();
        for (let i = 0; i < Math.min(400, verifyData.length); i += 4) {
          const r = verifyData[i];
          const g = verifyData[i + 1];
          const b = verifyData[i + 2];
          const a = verifyData[i + 3];
          if (a !== 0) {
            const color = `rgb(${r},${g},${b})`;
            sampleColors.add(color);
          }
        }
        console.log(`  前100个像素中的颜色种类: ${sampleColors.size}`);
        console.log(`  前5个样本颜色:`, Array.from(sampleColors).slice(0, 5));
      }

      // Get image data
      const scaledImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const scaledData = scaledImageData.data;

      // If we have unscaled image data, apply color palette conversion
      const unscaledImageDataUrl = (window as any).currentUnscaledImageDataUrl || null;
      if (unscaledImageDataUrl) {
        // Get selected palette for color conversion
        const currentPalette = (window as any).currentPalette || [];

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
            const finalColor = similarColor(originalColor, currentPalette);

            // Apply the final color
            scaledData[i] = finalColor[0];
            scaledData[i + 1] = finalColor[1];
            scaledData[i + 2] = finalColor[2];
          }
        }

        // Put the modified image data back to the temp canvas
        tempCtx.putImageData(scaledImageData, 0, 0);
      }

      // Count colors
      const calculatedColorCounts: { [key: string]: number } = {};
      if (__DEV__) {
        console.log("=== Content Script颜色计算开始 ===");
        console.log(`  图像尺寸: ${scaledImg.naturalWidth}x${scaledImg.naturalHeight}`);
      }

      // 获取当前调色盘
      const currentPalette = (window as any).currentPalette || [];
      if (__DEV__) {
        console.log("  当前调色盘:", currentPalette);
      }
      // currentPalette is already an array of RGB arrays, convert to RGB strings
      const paletteColorsSet = new Set(currentPalette.map((color: number[]) => `rgb(${color[0]},${color[1]},${color[2]})`));

      let outOfPaletteColors = 0;

      for (let y = 0; y < scaledImg.naturalHeight; y++) {
        for (let x = 0; x < scaledImg.naturalWidth; x++) {
          const i = y * 4 * scaledImg.naturalWidth + x * 4;
          const r = scaledData[i];
          const g = scaledData[i + 1];
          const b = scaledData[i + 2];
          const a = scaledData[i + 3];

          // Skip transparent pixels
          if (a === 0) continue;

          const color = `rgb(${r},${g},${b})`;
          calculatedColorCounts[color] = (calculatedColorCounts[color] || 0) + 1;

          // 检查是否为调色盘外颜色
          if (!paletteColorsSet.has(color)) {
            outOfPaletteColors++;
            if (outOfPaletteColors <= 10) {  // 只记录前10个
              if (__DEV__) {
                console.warn(`  发现调色盘外颜色 at (${x},${y}): ${color}`);
              }
            }
          }
        }
      }

      if (__DEV__) {
        console.log(`  检测到调色盘外颜色总数: ${outOfPaletteColors}`);
        if (outOfPaletteColors > 0) {
          console.log("  前几个调色盘外颜色:", Object.keys(calculatedColorCounts).filter(color => !paletteColorsSet.has(color)).slice(0, 5));
        }

        console.log("  颜色调色板颜色数量:", Object.keys(calculatedColorCounts).length);
      }

      // Now create the color panel with calculated color counts
      createColorPanelWithCalculatedColors(calculatedColorCounts, pixelScale);
    };
    scaledImg.src = scaledImageDataUrl;
    return;
  }

  // If we already have colorCounts, proceed with creating the panel
  createColorPanelWithCalculatedColors(colorCounts, pixelScale);
};

// Function to try clicking the corresponding color button in @5.txt
const tryClickColorButtonInAt5 = (color: string) => {
  console.log("Trying to click color button in @5.txt for color:", color);

  // Parse the color string to extract RGB values
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) {
    console.log("Invalid color format:", color);
    return;
  }

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  // Look for buttons with matching background color
  // The buttons are in the format: style="background: rgb(r, g, b);"
  const buttons = document.querySelectorAll('button[style*="background"]');

  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const style = button.getAttribute('style');

    if (style) {
      // Check if the button's background color matches
      const rgbMatch = style.match(/background:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const buttonR = parseInt(rgbMatch[1]);
        const buttonG = parseInt(rgbMatch[2]);
        const buttonB = parseInt(rgbMatch[3]);

        // Check if colors match (allowing for small differences)
        if (Math.abs(buttonR - r) <= 5 && Math.abs(buttonG - g) <= 5 && Math.abs(buttonB - b) <= 5) {
          console.log("Found matching color button, clicking it");
          (button as HTMLButtonElement).click();
          return;
        }
      }
    }
  }

  console.log("No matching color button found in @5.txt");
};

// Function to draw pixel art with borders
const drawPixelArtWithBorders = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, scale: number, gridScale: number) => {
  console.log(`drawPixelArtWithBorders called with scale: ${scale}, gridScale: ${gridScale}, gridScale * scale: ${gridScale * scale}`);

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Create a temporary canvas to get image data
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;

  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  tempCtx.drawImage(img, 0, 0);

  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;

  // Draw each pixel
  for (let y = 0; y < tempCanvas.height; y++) {
    for (let x = 0; x < tempCanvas.width; x++) {
      const i = y * 4 * tempCanvas.width + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip transparent pixels
      if (a === 0) continue;

      const pixelX = x * scale;
      const pixelY = y * scale;

      // Draw pixel fill
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(pixelX, pixelY, scale, scale);
    }
  }

  // Draw grid lines for pixel blocks (gridScale x gridScale)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;

  // Calculate the dimensions of the scaled image
  const scaledWidth = tempCanvas.width * scale;
  const scaledHeight = tempCanvas.height * scale;

  console.log(`Canvas size: ${scaledWidth} x ${scaledHeight}`);

  // Vertical lines - draw a line every 'gridScale' pixels in the scaled image
  for (let x = 0; x <= scaledWidth; x += gridScale * scale) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, scaledHeight);
    ctx.stroke();
  }

  // Horizontal lines - draw a line every 'gridScale' pixels in the scaled image
  for (let y = 0; y <= scaledHeight; y += gridScale * scale) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(scaledWidth, y);
    ctx.stroke();
  }

  console.log(`Finished drawing with scale: ${scale}, gridScale: ${gridScale}`);
};

// Function to redraw canvas with new scale
const redrawCanvasWithBorders = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, img: HTMLImageElement, scale: number, gridScale: number) => {
  // Set canvas size
  canvas.width = img.naturalWidth * scale;
  canvas.height = img.naturalHeight * scale;

  // Draw image with pixel borders
  drawPixelArtWithBorders(ctx, img, scale, gridScale);
};

// Function to create and place the overlay
const placeOverlay = (dataUrl: string) => {
  console.log('Creating and placing overlay');
  
  // Remove existing overlay and control panel if any
  // But don't remove the save locations panel
  if (overlayElement) {
    console.log('Removing existing overlay element');
    overlayElement.remove();
  }
  if (controlPanelElement) {
    console.log('Removing existing control panel element');
    // Remove event listeners to prevent memory leaks and unexpected behavior
    if (activeControlPanelDragListeners) {
      document.removeEventListener('mousemove', controlPanelGlobalDragHandler);
      document.removeEventListener('mouseup', controlPanelGlobalDragEndHandler);
      activeControlPanelDragListeners = false;
    }
    controlPanelElement.remove();
  }

  // Note: We intentionally don't remove saveLocationsPanelElement here
  // to preserve its position and state

  // Create overlay container
  console.log('Creating overlay container');
  overlayElement = document.createElement('div');
  overlayElement.id = 'wplace-professor-overlay';
  overlayElement.style.position = 'fixed';
  overlayElement.style.left = '100px';
  overlayElement.style.top = '100px';
  overlayElement.style.transform = 'translate(0px, 0px)';
  overlayElement.style.zIndex = '99998';
  overlayElement.style.cursor = 'move';
  overlayElement.style.userSelect = 'none';
  overlayElement.style.pointerEvents = 'none'; // Allow clicks to pass through to the canvas below

  // Create canvas for the pixel art
  console.log('Creating canvas for pixel art');
  const canvas = document.createElement('canvas');
  canvas.style.imageRendering = 'pixelated'; // For sharp pixel edges
  canvas.style.opacity = '0.9'; // Higher transparency
  canvas.style.pointerEvents = 'none'; // Allow clicks to pass through to the canvas below

  overlayElement.appendChild(canvas);
  document.body.appendChild(overlayElement);

  // Create separate control panel
  console.log('Creating control panel');
  controlPanelElement = document.createElement('div');
  controlPanelElement.id = 'wplace-professor-control-panel';
  controlPanelElement.style.position = 'fixed';
  controlPanelElement.style.top = '20px';
  controlPanelElement.style.right = '20px';
  controlPanelElement.style.zIndex = '99999';
  controlPanelElement.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  controlPanelElement.style.padding = '12px';
  controlPanelElement.style.borderRadius = '6px';
  controlPanelElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  controlPanelElement.style.fontFamily = 'Arial, sans-serif';
  controlPanelElement.style.minWidth = '180px';
  controlPanelElement.style.width = '180px';
  controlPanelElement.style.maxWidth = '180px';
  controlPanelElement.style.fontSize = '14px'; // Base font size
  // 移除了 userSelect: 'none'，改为只在标题区域阻止文字选择

  // State for panel minimized/maximized
  // When placing overlay, always initialize panel as expanded (not minimized)
  let isPanelMinimized = false;
  console.log('Control panel initialized with isPanelMinimized:', isPanelMinimized);
  
  // Save the initial state to localStorage to ensure consistency
  try {
    localStorage.setItem(CONTROL_PANEL_STATE_KEY, JSON.stringify({ isMinimized: false }));
    console.log('Initial control panel state saved to localStorage:', { isMinimized: false });
  } catch (e) {
    if (__DEV__) {
      console.error('Error saving initial control panel state:', e);
    }
  }

  // Create control panel title with minimize/maximize button
  console.log('Creating control panel title container');
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.marginBottom = '8px';
  titleContainer.style.userSelect = 'none'; // 只在标题区域阻止文字选择

  const title = document.createElement('h3');
  title.textContent = 'Control'; // Changed from 'Controls'
  title.style.margin = '0';
  title.style.fontSize = '18px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';

  const toggleButton = document.createElement('button');
  toggleButton.textContent = '−'; // Minimize symbol
  toggleButton.style.background = 'none';
  toggleButton.style.border = '1px solid #ccc';
  toggleButton.style.borderRadius = '3px';
  toggleButton.style.padding = '2px 6px';
  toggleButton.style.cursor = 'pointer';
  toggleButton.style.fontSize = '14px';
  toggleButton.style.fontWeight = 'bold';
  toggleButton.title = 'Minimize/Maximize panel';

  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const previousState = isPanelMinimized;
    isPanelMinimized = !isPanelMinimized;
    
    // Update global state for drag handler
    controlPanelMinimizedState = isPanelMinimized;
    
    console.log(`Control panel toggle button clicked. State changed from ${previousState} to ${isPanelMinimized}`);

    // Save panel state to localStorage
    try {
      localStorage.setItem(CONTROL_PANEL_STATE_KEY, JSON.stringify({ isMinimized: isPanelMinimized }));
      console.log('Control panel state saved to localStorage:', { isMinimized: isPanelMinimized });
    } catch (e) {
      if (__DEV__) {
        console.error('Error saving control panel state:', e);
      }
    }

    if (isPanelMinimized) {
      // Minimize panel
      console.log('Minimizing control panel');
      controlPanelElement!.style.minWidth = '40px';
      controlPanelElement!.style.width = '40px';
      controlPanelElement!.style.maxWidth = '40px';
      controlPanelElement!.style.padding = '8px';
      titleContainer.style.marginBottom = '0';
      title.textContent = 'C'; // Show only first letter
      toggleButton.textContent = '+'; // Maximize symbol
      console.log('Set title text to:', title.textContent);
      console.log('Set toggle button text to:', toggleButton.textContent);

      // Adjust header styles to match Location panel when minimized
      titleContainer.style.justifyContent = 'center'; // Center content
      title.style.flex = '1'; // Allow title to grow
      title.style.textAlign = 'left'; // Align text to left
      toggleButton.style.marginLeft = 'auto'; // Push toggle button to the right

      // Hide all children except titleContainer
      Array.from(controlPanelElement!.children).forEach(child => {
        if (child !== titleContainer) {
          (child as HTMLElement).style.display = 'none';
        }
      });
      console.log('Finished minimizing control panel');
    } else {
      // Maximize panel
      console.log('Maximizing control panel');
      controlPanelElement!.style.minWidth = '180px';
      controlPanelElement!.style.width = '180px';
      controlPanelElement!.style.maxWidth = '180px';
      controlPanelElement!.style.padding = '12px';
      titleContainer.style.marginBottom = '8px';
      title.textContent = 'Control'; // Restore full title
      toggleButton.textContent = '−'; // Minimize symbol
      console.log('Set title text to:', title.textContent);
      console.log('Set toggle button text to:', toggleButton.textContent);

      // Reset header styles to default
      titleContainer.style.justifyContent = 'space-between'; // Reset to default
      title.style.flex = ''; // Reset flex property
      title.style.textAlign = ''; // Reset text alignment
      toggleButton.style.marginLeft = ''; // Reset margin

      // Show all children and restore their original display properties
      opacityLabel.style.display = '';
      opacitySlider.style.display = '';
      zoomLabel.style.display = '';
      zoomSlider.style.display = '';
      zoomButtonsContainer.style.display = 'flex';
      directionButtonsContainer.style.display = 'grid';
      modeToggleBtn.style.display = '';
      closeBtn.style.display = '';

      // Restore color panel if it exists
      if (colorPanelElement) {
        colorPanelElement.style.display = '';
        // Also restore the color panel wrapper if it exists
        const colorPanelWrapper = document.getElementById('wplace-professor-color-panel-wrapper');
        if (colorPanelWrapper) {
          colorPanelWrapper.style.display = '';
        }
      }
      console.log('Finished maximizing control panel');
    }
  });

  titleContainer.appendChild(title);
  titleContainer.appendChild(toggleButton);

  // Create opacity slider
  const opacityLabel = document.createElement('div');
  opacityLabel.id = 'opacity-label';
  opacityLabel.textContent = 'Opacity: 90%';
  opacityLabel.style.fontSize = '13px';
  opacityLabel.style.marginBottom = '4px';
  opacityLabel.style.color = '#555';
  opacityLabel.style.fontWeight = 'bold';

  const opacitySlider = document.createElement('input');
  opacitySlider.type = 'range';
  opacitySlider.id = 'opacity-slider';
  opacitySlider.min = '0.1';
  opacitySlider.max = '1.0';
  opacitySlider.step = '0.01';
  opacitySlider.value = '0.9'; // Default opacity
  opacitySlider.style.width = '100%';
  opacitySlider.style.marginBottom = '8px';
  opacitySlider.style.cursor = 'pointer';

  // Add event listener to the opacity slider
  opacitySlider.addEventListener('input', (e) => {
    const opacity = parseFloat((e.target as HTMLInputElement).value);
    (document.getElementById('opacity-label') as HTMLElement).textContent = `Opacity: ${Math.round(opacity * 100)}%`;

    // Update the overlay canvas opacity
    const canvas = overlayElement?.querySelector('canvas');
    if (canvas) {
      canvas.style.opacity = opacity.toString();
    }
  });

  // Create zoom slider
  const zoomLabel = document.createElement('div');
  zoomLabel.id = 'zoom-label';
  zoomLabel.textContent = 'Zoom: 1.00x';
  zoomLabel.style.fontSize = '13px';
  zoomLabel.style.marginBottom = '4px';
  zoomLabel.style.color = '#555';
  zoomLabel.style.fontWeight = 'bold';

  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.id = 'zoom-slider';
  zoomSlider.min = '0.1';
  zoomSlider.max = '15.0'; // Increased from 5.0 to 15.0
  zoomSlider.step = '0.01';
  zoomSlider.value = '1.0';
  zoomSlider.style.width = '100%';
  zoomSlider.style.marginBottom = '4px';
  zoomSlider.style.cursor = 'pointer';

  // Create zoom buttons container
  const zoomButtonsContainer = document.createElement('div');
  zoomButtonsContainer.style.display = 'flex';
  zoomButtonsContainer.style.gap = '4px';
  zoomButtonsContainer.style.marginBottom = '8px';

  // Create zoom out button
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = '-';
  zoomOutBtn.style.flex = '1';
  zoomOutBtn.style.background = '#f0f0f0';
  zoomOutBtn.style.border = '1px solid #ccc';
  zoomOutBtn.style.borderRadius = '3px';
  zoomOutBtn.style.padding = '4px';
  zoomOutBtn.style.cursor = 'pointer';
  zoomOutBtn.style.fontSize = '14px';
  zoomOutBtn.style.fontWeight = 'bold';

  // Create zoom in button
  const zoomInBtn = document.createElement('button');
  zoomInBtn.textContent = '+';
  zoomInBtn.style.flex = '1';
  zoomInBtn.style.background = '#f0f0f0';
  zoomInBtn.style.border = '1px solid #ccc';
  zoomInBtn.style.borderRadius = '3px';
  zoomInBtn.style.padding = '4px';
  zoomInBtn.style.cursor = 'pointer';
  zoomInBtn.style.fontSize = '14px';
  zoomInBtn.style.fontWeight = 'bold';

  zoomButtonsContainer.appendChild(zoomOutBtn);
  zoomButtonsContainer.appendChild(zoomInBtn);

  // Create direction buttons container
  const directionButtonsContainer = document.createElement('div');
  directionButtonsContainer.style.display = 'grid';
  directionButtonsContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
  directionButtonsContainer.style.gridTemplateRows = 'repeat(3, 1fr)';
  directionButtonsContainer.style.gap = '3px';
  directionButtonsContainer.style.marginBottom = '8px';

  // Create direction buttons
  const upBtn = document.createElement('button');
  upBtn.textContent = '↑';
  upBtn.style.background = '#e0e0e0';
  upBtn.style.border = '1px solid #ccc';
  upBtn.style.borderRadius = '3px';
  upBtn.style.padding = '4px';
  upBtn.style.cursor = 'pointer';
  upBtn.style.fontSize = '12px';
  upBtn.style.fontWeight = 'bold';
  upBtn.style.gridRow = '1';
  upBtn.style.gridColumn = '2';

  const leftBtn = document.createElement('button');
  leftBtn.textContent = '←';
  leftBtn.style.background = '#e0e0e0';
  leftBtn.style.border = '1px solid #ccc';
  leftBtn.style.borderRadius = '3px';
  leftBtn.style.padding = '4px';
  leftBtn.style.cursor = 'pointer';
  leftBtn.style.fontSize = '12px';
  leftBtn.style.fontWeight = 'bold';
  leftBtn.style.gridRow = '2';
  leftBtn.style.gridColumn = '1';

  const rightBtn = document.createElement('button');
  rightBtn.textContent = '→';
  rightBtn.style.background = '#e0e0e0';
  rightBtn.style.border = '1px solid #ccc';
  rightBtn.style.borderRadius = '3px';
  rightBtn.style.padding = '4px';
  rightBtn.style.cursor = 'pointer';
  rightBtn.style.fontSize = '12px';
  rightBtn.style.fontWeight = 'bold';
  rightBtn.style.gridRow = '2';
  rightBtn.style.gridColumn = '3';

  const downBtn = document.createElement('button');
  downBtn.textContent = '↓';
  downBtn.style.background = '#e0e0e0';
  downBtn.style.border = '1px solid #ccc';
  downBtn.style.borderRadius = '3px';
  downBtn.style.padding = '4px';
  downBtn.style.cursor = 'pointer';
  downBtn.style.fontSize = '12px';
  downBtn.style.fontWeight = 'bold';
  downBtn.style.gridRow = '3';
  downBtn.style.gridColumn = '2';

  directionButtonsContainer.appendChild(upBtn);
  directionButtonsContainer.appendChild(leftBtn);
  directionButtonsContainer.appendChild(rightBtn);
  directionButtonsContainer.appendChild(downBtn);

  directionButtonsContainer.appendChild(upBtn);
  directionButtonsContainer.appendChild(leftBtn);
  directionButtonsContainer.appendChild(rightBtn);
  directionButtonsContainer.appendChild(downBtn);

  // Create mode toggle button
  const modeToggleBtn = document.createElement('button');
  modeToggleBtn.textContent = 'Drag Mode';
  modeToggleBtn.style.background = '#4CAF50';
  modeToggleBtn.style.color = 'white';
  modeToggleBtn.style.border = 'none';
  modeToggleBtn.style.borderRadius = '3px';
  modeToggleBtn.style.padding = '6px 10px';
  modeToggleBtn.style.cursor = 'pointer';
  modeToggleBtn.style.fontSize = '13px';
  modeToggleBtn.style.width = '100%';
  modeToggleBtn.style.marginBottom = '8px';
  modeToggleBtn.style.fontWeight = 'bold';

  modeToggleBtn.addEventListener('mouseenter', () => {
    modeToggleBtn.style.background = '#45a049';
  });

  modeToggleBtn.addEventListener('mouseleave', () => {
    modeToggleBtn.style.background = '#4CAF50';
  });

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.background = '#ff4444';
  closeBtn.style.color = 'white';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '3px';
  closeBtn.style.padding = '6px 10px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '13px';
  closeBtn.style.width = '100%';
  closeBtn.style.fontWeight = 'bold';

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#cc3333';
  });

  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = '#ff4444';
  });

  controlPanelElement.appendChild(titleContainer);
  controlPanelElement.appendChild(opacityLabel);
  controlPanelElement.appendChild(opacitySlider);
  controlPanelElement.appendChild(zoomLabel);
  controlPanelElement.appendChild(zoomSlider);
  controlPanelElement.appendChild(zoomButtonsContainer);
  controlPanelElement.appendChild(directionButtonsContainer);
  controlPanelElement.appendChild(modeToggleBtn);
  controlPanelElement.appendChild(closeBtn);
  document.body.appendChild(controlPanelElement);
  console.log('Control panel added to document body');

  // Load image and draw it on canvas with pixel borders
  const img = new Image();
  img.onload = function () {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Get pixelScale and palette from window object
      const pixelScale = ((window as any).currentPixelScale || 1) * 0.01;
      const palette = (window as any).currentPalette || [];
      const scaledImageDataUrl = (window as any).currentScaledImageDataUrl || null;
      console.log("Using pixelScale:", pixelScale);
      console.log("Using palette:", palette);
      console.log("img.naturalWidth:", img.naturalWidth);
      console.log("img.naturalHeight:", img.naturalHeight);

      // If we have scaled image data, use it directly
      const scaledImg = new Image();
      scaledImg.onload = function () {
        // Create a temporary canvas for processing
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        // Draw the scaled image
        tempCanvas.width = scaledImg.naturalWidth;
        tempCanvas.height = scaledImg.naturalHeight;
        tempCtx.drawImage(scaledImg, 0, 0);

        // Get image data
        const scaledImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const scaledData = scaledImageData.data;

        // If we have unscaled image data, apply color palette conversion
        const unscaledImageDataUrl = (window as any).currentUnscaledImageDataUrl || null;
        if (unscaledImageDataUrl) {
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
              const finalColor = similarColor(originalColor, palette);

              // Apply the final color
              scaledData[i] = finalColor[0];
              scaledData[i + 1] = finalColor[1];
              scaledData[i + 2] = finalColor[2];
            }
          }

          // Put the modified image data back to the temp canvas
          tempCtx.putImageData(scaledImageData, 0, 0);
        }

        // Draw each pixel as a block with border, padding, and center color
        // Create another temporary canvas for the block drawing
        const blockCanvas = document.createElement('canvas');
        const blockCtx = blockCanvas.getContext('2d');
        if (!blockCtx) return;

        // blockSize is the size of each pixel block in the final display
        // It's the ratio between original and scaled dimensions
        const originalImageWidth = (window as any).originalImageWidth || scaledImg.naturalWidth;
        const originalImageHeight = (window as any).originalImageHeight || scaledImg.naturalHeight;
        const pixelWidthRatio = originalImageWidth / scaledImg.naturalWidth;
        const blockSize = Math.round(pixelWidthRatio * 1.0); // Default scale factor of 1.0

        blockCanvas.width = Math.round(originalImageWidth * 1.0);
        blockCanvas.height = Math.round(originalImageHeight * 1.0);

        // Draw each pixel as a block with border, padding, and center color
        for (let y = 0; y < scaledImg.naturalHeight; y++) {
          for (let x = 0; x < scaledImg.naturalWidth; x++) {
            const i = y * 4 * scaledImg.naturalWidth + x * 4;
            const r = scaledData[i];
            const g = scaledData[i + 1];
            const b = scaledData[i + 2];
            const a = scaledData[i + 3];

            // Skip transparent pixels
            if (a === 0) continue;

            const color = `rgb(${r},${g},${b})`;

            // Draw pixel block with border, padding, and center color
            const blockX = x * blockSize;
            const blockY = y * blockSize;

            // Always draw the full pixel block structure in this section (no color filter)
            drawPixelBlock(blockCtx, blockX, blockY, blockSize, color, true, 1.0);
          }
        }

        // Draw border around the entire image
        // blockCtx.strokeStyle = '#000000';
        // blockCtx.lineWidth = 2;
        // blockCtx.strokeRect(0, 0, blockCanvas.width, blockCanvas.height);

        // Copy the block image to the main canvas
        canvas.width = blockCanvas.width;
        canvas.height = blockCanvas.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(blockCanvas, 0, 0);

        // Count colors for the color panel
        const colorCounts: { [key: string]: number } = {};
        for (let y = 0; y < scaledImg.naturalHeight; y++) {
          for (let x = 0; x < scaledImg.naturalWidth; x++) {
            const i = y * 4 * scaledImg.naturalWidth + x * 4;
            const r = scaledData[i];
            const g = scaledData[i + 1];
            const b = scaledData[i + 2];
            const a = scaledData[i + 3];

            // Skip transparent pixels
            if (a === 0) continue;

            const color = `rgb(${r},${g},${b})`;
            colorCounts[color] = (colorCounts[color] || 0) + 1;
          }
        }

        // Store color counts for later use
        (window as any).colorCounts = colorCounts;

        // Create color panel
        createColorPanel(colorCounts, blockSize);
      };
      scaledImg.src = scaledImageDataUrl || (window as any).currentUnscaledImageDataUrl;
    }
  };
  img.src = dataUrl;

  // Set up smooth zoom control with slider
  zoomSlider.addEventListener('input', (e) => {
    const scale = parseFloat((e.target as HTMLInputElement).value);
    (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${scale.toFixed(2)}x`;
    // We'll update the canvas when the image is loaded
  });

  // Set up zoom buttons with same behavior as slider
  const zoomStep = 0.01; // Step for zoom in/out buttons

  // Function to perform zoom with same behavior as slider
  const performZoom = (newScale: number) => {
    // Update slider and label
    zoomSlider.value = newScale.toString();
    (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${newScale.toFixed(2)}x`;
    // We'll update the canvas when the image is loaded
  };

  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dragging
    const currentScale = parseFloat(zoomSlider.value);
    const newScale = Math.min(currentScale + zoomStep, 15.0); // Increased from 5.0 to 15.0
    performZoom(newScale);
  });

  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dragging
    const currentScale = parseFloat(zoomSlider.value);
    const newScale = Math.max(currentScale - zoomStep, 0.1);
    performZoom(newScale);
  });

  // Add event listener to the opacity slider
  opacitySlider.addEventListener('input', (e) => {
    const opacity = parseFloat((e.target as HTMLInputElement).value);
    (document.getElementById('opacity-label') as HTMLElement).textContent = `Opacity: ${Math.round(opacity * 100)}%`;

    // Update the overlay canvas opacity
    const canvas = overlayElement?.querySelector('canvas');
    if (canvas) {
      canvas.style.opacity = opacity.toString();
    }
  });

  // Mode toggle button event
  let isDragMode = false;
  modeToggleBtn.addEventListener('click', () => {
    isDragMode = !isDragMode;
    if (overlayElement) {
      const canvas = overlayElement.querySelector('canvas');
      if (isDragMode) {
        // Enable drag mode - allow interaction with overlay
        overlayElement.style.pointerEvents = 'auto';
        if (canvas) {
          canvas.style.pointerEvents = 'none'; // Keep canvas non-interactive
        }
        modeToggleBtn.textContent = 'Disable Drag Mode';
        modeToggleBtn.style.background = '#ff9800';
      } else {
        // Disable drag mode - ignore overlay for clicks
        overlayElement.style.pointerEvents = 'none';
        if (canvas) {
          canvas.style.pointerEvents = 'none'; // Keep canvas non-interactive
        }
        modeToggleBtn.textContent = 'Enable Drag Mode';
        modeToggleBtn.style.background = '#4CAF50';
      }
    }
  });

  // Close button event
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Close button clicked, removing overlay and control panel');
    removeOverlay();
  });

  // Make the panel draggable
  // Clean up any existing drag listeners
  if (activeControlPanelDragListeners) {
    document.removeEventListener('mousemove', controlPanelGlobalDragHandler);
    document.removeEventListener('mouseup', controlPanelGlobalDragEndHandler);
    activeControlPanelDragListeners = false;
  }
  
  // Set up drag state
  isControlPanelDragging = false;
  controlPanelCurrentX = 0;
  controlPanelCurrentY = 0;
  controlPanelInitialX = 0;
  controlPanelInitialY = 0;
  controlPanelXOffset = 0;
  controlPanelYOffset = 0;
  controlPanelTitleContainer = titleContainer;
  controlPanelMinimizedState = isPanelMinimized;
  
  // Attach event listeners for dragging
  controlPanelElement.addEventListener('mousedown', controlPanelGlobalDragStartHandler);
  document.addEventListener('mousemove', controlPanelGlobalDragHandler);
  document.addEventListener('mouseup', controlPanelGlobalDragEndHandler);
  activeControlPanelDragListeners = true;

  // Prevent text selection when dragging
  controlPanelElement.addEventListener('selectstart', (e) => e.preventDefault());

  if (__DEV__) {
    console.log('Overlay placed at center of screen with separate control panel');
  }

  // Note: We don't create the save locations panel here to preserve its state
  // The save locations panel is created once on page load and should not be recreated
};

// Set up click listener for overlay placement
const setupOverlayPlacement = () => {
  if (pixelArtDataUrl) {
    placeOverlay(pixelArtDataUrl);
  }
};

// Listen for messages from the SidePanel
const setupMessageListener = () => {
  // Remove existing listener if it exists
  if (isListenerSetUp) {
    console.log("Message listener already set up, skipping");
    return;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received message:", request);
    if (request.action === "getAvailableColors") {
      const colors = detectAvailableColors();
      sendResponse({ availableColors: colors });
    } else if (request.action === "prepareForOverlayPlacement") {
      console.log("Received prepareForOverlayPlacement message with pixelScale:", request.pixelScale);
      if (request.pixelArtDataUrl) {
        pixelArtDataUrl = request.pixelArtDataUrl;
        // 不再直接使用传入的colorCounts，让createColorPanel自己计算
        // colorCounts = request.colorCounts || {};
        // Store the pixelScale, pixelArtDataUrl, scaledImageDataUrl, palette, and original image dimensions for use in drawing functions
        (window as any).currentPixelScale = request.pixelScale || 1;
        (window as any).currentPixelArtDataUrl = request.pixelArtDataUrl;
        (window as any).currentScaledImageDataUrl = request.scaledImageDataUrl || null;
        (window as any).currentUnscaledImageDataUrl = request.unscaledImageDataUrl || null; // 存储缩小但未调色的图像数据
        (window as any).currentPalette = request.palette || [];
        (window as any).originalImageWidth = request.originalImageWidth || 0;
        (window as any).originalImageHeight = request.originalImageHeight || 0;
        setupOverlayPlacement();
        sendResponse({ status: "Ready for overlay placement" });
      } else {
        sendResponse({ status: "Error: Missing pixelArtDataUrl" });
      }
    } else if (request.action === "removeOverlay") {
      removeOverlay();
      sendResponse({ status: "Overlay removed" });
    }
  });

  isListenerSetUp = true;
  console.log("Message listener set up");
};

// Ensure the content script is ready to receive messages
if (__DEV__) {
  console.log('WPlace Professor Content Script loaded');
}

// Set up the message listener
setupMessageListener();

// Re-setup the listener when the document is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded, re-setting up message listener');
    isListenerSetUp = false; // Reset the flag
    setupMessageListener();
  });
} else {
  // DOM is already loaded
  setupMessageListener();
}

// Also set up the listener when the page is fully loaded
window.addEventListener('load', () => {
  console.log('Page fully loaded, re-setting up message listener');
  isListenerSetUp = false; // Reset the flag
  setupMessageListener();
  
  // Create the save locations panel on page load only for wplace.live
  if (window.location.hostname.includes('wplace.live')) {
    createSaveLocationsPanel();
  }
});

// Handle page visibility changes (tab switching)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('Page became visible, checking message listener');
    // Reset the flag and re-setup the listener
    isListenerSetUp = false;
    setupMessageListener();
  }
});

// Handle page refresh/unload
window.addEventListener('beforeunload', () => {
  console.log('Page unloading, cleaning up');
  // Clean up any resources if needed
});

// Function to remove the overlay
const removeOverlay = () => {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }

  if (controlPanelElement) {
    // Remove event listeners to prevent memory leaks and unexpected behavior
    if (activeControlPanelDragListeners) {
      document.removeEventListener('mousemove', controlPanelGlobalDragHandler);
      document.removeEventListener('mouseup', controlPanelGlobalDragEndHandler);
      activeControlPanelDragListeners = false;
    }
    controlPanelElement.remove();
    controlPanelElement = null;
  }

  // Remove any existing highlights
  const existingHighlights = document.querySelectorAll('.wplace-pixel-highlight, .wplace-pixel-highlight-container');
  existingHighlights.forEach(el => el.remove());
};

// Global drag handlers for control panel
let isControlPanelDragging = false;
let controlPanelCurrentX: number = 0;
let controlPanelCurrentY: number = 0;
let controlPanelInitialX: number = 0;
let controlPanelInitialY: number = 0;
let controlPanelXOffset = 0;
let controlPanelYOffset = 0;
let controlPanelTitleContainer: HTMLDivElement | null = null;
let controlPanelMinimizedState: boolean = false;

function controlPanelGlobalDragStartHandler(e: MouseEvent) {
  // Allow dragging from anywhere except buttons
  const target = e.target as HTMLElement;
  if (target.tagName !== 'BUTTON' && controlPanelElement) {
    console.log('Control panel drag start');
    controlPanelInitialX = e.clientX - controlPanelXOffset;
    controlPanelInitialY = e.clientY - controlPanelYOffset;

    isControlPanelDragging = true;
    e.preventDefault(); // Prevent text selection
    e.stopPropagation(); // Prevent other event handlers
  }
}

function controlPanelGlobalDragHandler(e: MouseEvent) {
  if (isControlPanelDragging && controlPanelElement) {
    console.log('Control panel dragging');
    controlPanelCurrentX = e.clientX - controlPanelInitialX;
    controlPanelCurrentY = e.clientY - controlPanelInitialY;

    controlPanelXOffset = controlPanelCurrentX;
    controlPanelYOffset = controlPanelCurrentY;

    controlPanelElement.style.transform = `translate3d(${controlPanelCurrentX}px, ${controlPanelCurrentY}px, 0)`;
    
    // Prevent any default behavior that might cause expansion
    e.preventDefault();
    e.stopPropagation();
  }
}

function controlPanelGlobalDragEndHandler(e: MouseEvent) {
  console.log('Control panel drag ended, isPanelMinimized:', controlPanelMinimizedState);
  controlPanelInitialX = controlPanelCurrentX;
  controlPanelInitialY = controlPanelCurrentY;

  isControlPanelDragging = false;
  
  // Always ensure panel stays in its current state (minimized or expanded)
  if (controlPanelMinimizedState && controlPanelElement && controlPanelTitleContainer) {
    console.log('Control panel was minimized, restoring minimized state');
    // Force minimized styles to ensure panel stays minimized
    setTimeout(() => {
      if (controlPanelMinimizedState && controlPanelElement && controlPanelTitleContainer) { // Double-check the state
        console.log('Applying minimized styles in drag end');
        controlPanelElement.style.minWidth = '40px';
        controlPanelElement.style.padding = '8px';
        controlPanelTitleContainer.style.marginBottom = '0';
        // Don't force set title and toggleButton text here as they might have been updated by user interaction
        // title.textContent and toggleButton.textContent should already be correct
        
        // Ensure all children except titleContainer are hidden
        Array.from(controlPanelElement.children).forEach(child => {
          if (child !== controlPanelTitleContainer) {
            (child as HTMLElement).style.display = 'none';
          }
        });
        console.log('Finished applying minimized styles in drag end');
      }
    }, 0);
  }
}

// Global drag handlers for location panel
let isLocationPanelDragging = false;
let locationPanelCurrentX: number = 0;
let locationPanelCurrentY: number = 0;
let locationPanelInitialX: number = 0;
let locationPanelInitialY: number = 0;
let locationPanelXOffset = 0;
let locationPanelYOffset = 0;

function locationPanelGlobalDragStartHandler(e: MouseEvent) {
  // Allow dragging from anywhere except buttons
  const target = e.target as HTMLElement;
  if (target.tagName !== 'BUTTON' && saveLocationsPanelElement) {
    console.log('Save locations panel drag start');
    // Get current position directly from the element
    const rect = saveLocationsPanelElement.getBoundingClientRect();
    locationPanelXOffset = rect.left;
    locationPanelYOffset = rect.top;
    
    locationPanelInitialX = e.clientX - locationPanelXOffset;
    locationPanelInitialY = e.clientY - locationPanelYOffset;

    isLocationPanelDragging = true;
    e.preventDefault(); // Prevent text selection
    e.stopPropagation(); // Prevent other event handlers
  }
}

function locationPanelGlobalDragHandler(e: MouseEvent) {
  if (isLocationPanelDragging && saveLocationsPanelElement) {
    console.log('Save locations panel dragging');
    locationPanelCurrentX = e.clientX - locationPanelInitialX;
    locationPanelCurrentY = e.clientY - locationPanelInitialY;

    locationPanelXOffset = locationPanelCurrentX;
    locationPanelYOffset = locationPanelCurrentY;

    // Remove the transform style that was used for initial positioning
    saveLocationsPanelElement.style.transform = '';
    // Set position using left and top instead
    saveLocationsPanelElement.style.left = `${locationPanelCurrentX}px`;
    saveLocationsPanelElement.style.top = `${locationPanelCurrentY}px`;
    
    // Prevent any default behavior that might cause expansion
    e.preventDefault();
    e.stopPropagation();
  }
}

function locationPanelGlobalDragEndHandler(e: MouseEvent) {
  console.log('Save locations panel drag ended, isPanelMinimized:', false); // We'll need to track this state separately
  locationPanelInitialX = locationPanelCurrentX;
  locationPanelInitialY = locationPanelCurrentY;

  isLocationPanelDragging = false;
  
  // Note: We're not implementing the same restoration logic for location panel as it's less critical
}

// Helper function to create color panel with calculated color counts
const createColorPanelWithCalculatedColors = (colorCounts: { [key: string]: number }, pixelScale: number) => {
  console.log("=== Content Script颜色面板创建 ===");
  console.log(`  接收到的颜色种类数量: ${Object.keys(colorCounts).length}`);

  // DEBUG: 比较SidePanel和Content Script的调色盘
  const sidePanelPalette = (window as any).currentPalette || [];
  console.log("  SidePanel调色盘:", sidePanelPalette);

  // 获取当前调色盘
  const currentPalette = (window as any).currentPalette || [];
  console.log("  当前调色盘:", currentPalette);
  // currentPalette is already an array of RGB arrays, convert to RGB strings
  const paletteColorsSet = new Set(currentPalette.map((color: number[]) => `rgb(${color[0]},${color[1]},${color[2]})`));

  // 检查颜色是否在调色盘范围内
  const outOfPaletteColors = Object.keys(colorCounts).filter(color => !paletteColorsSet.has(color));
  console.log(`  调色盘外颜色种类数量: ${outOfPaletteColors.length}`);
  if (outOfPaletteColors.length > 0) {
    console.warn("  发现调色盘外颜色:", outOfPaletteColors.slice(0, 10)); // 只显示前10个
  }

  // 计算总像素数
  const totalPixels = Object.values(colorCounts).reduce((sum, count) => sum + count, 0);
  console.log(`  总像素数: ${totalPixels}`);

  // Create color panel wrapper (always visible)
  const colorPanelWrapper = document.createElement('div');
  colorPanelWrapper.id = 'wplace-professor-color-panel-wrapper';
  colorPanelWrapper.style.marginTop = '12px';
  colorPanelWrapper.style.border = '1px solid #ddd';
  colorPanelWrapper.style.borderRadius = '4px';
  colorPanelWrapper.style.backgroundColor = 'rgba(245, 245, 245, 0.9)';

  // Create color panel title with toggle button (always visible)
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.padding = '8px';
  titleContainer.style.cursor = 'pointer';

  const title = document.createElement('h4');
  title.textContent = 'Colors';
  title.style.margin = '0';
  title.style.fontSize = '15px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';

  // Create buttons container for clear and toggle buttons
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.gap = '4px';

  // Create clear selection button
  const clearButton = document.createElement('button');
  clearButton.textContent = '✕'; // X symbol for clear
  clearButton.style.background = 'none';
  clearButton.style.border = 'none';
  clearButton.style.fontSize = '12px';
  clearButton.style.cursor = 'pointer';
  clearButton.style.padding = '2px 6px';
  clearButton.style.borderRadius = '3px';
  clearButton.style.backgroundColor = '#e0e0e0';
  clearButton.title = 'Clear color selection';

  // Add click event to clear color selection
  clearButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering the title container click event

    // Clear any existing color filter
    (window as any).currentColorFilter = null;

    // Remove highlight from all color buttons
    const allButtons = colorPanelElement?.querySelectorAll('div[style*="flex"]');
    allButtons?.forEach(btn => {
      (btn as HTMLElement).style.fontWeight = 'normal';
    });

    // Redraw canvas with all colors
    const canvas = overlayElement?.querySelector('canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = function () {
          // Get current scale from the zoom slider
          const currentScale = parseFloat((document.getElementById('zoom-slider') as HTMLInputElement)?.value) || 1.0;
          const pixelScale = ((window as any).currentPixelScale || 1) * 0.01;
          redrawCanvasWithColorBlocks(canvas, ctx, img, pixelScale, currentScale, null);
        };
        img.src = (window as any).currentPixelArtDataUrl || '';
      }
    }
  });

  const toggleButton = document.createElement('button');
  toggleButton.textContent = '▲'; // Up arrow for collapse (default expanded)
  toggleButton.style.background = 'none';
  toggleButton.style.border = 'none';
  toggleButton.style.fontSize = '12px';
  toggleButton.style.cursor = 'pointer';
  toggleButton.style.padding = '2px 6px';
  toggleButton.style.borderRadius = '3px';
  toggleButton.style.backgroundColor = '#e0e0e0';

  buttonsContainer.appendChild(clearButton);
  buttonsContainer.appendChild(toggleButton);
  titleContainer.appendChild(title);
  titleContainer.appendChild(buttonsContainer);

  // Create the actual color panel content (can be hidden)
  colorPanelElement = document.createElement('div');
  colorPanelElement.id = 'wplace-professor-color-panel';
  colorPanelElement.style.padding = '8px';
  colorPanelElement.style.maxHeight = '180px';
  colorPanelElement.style.overflowY = 'auto';
  colorPanelElement.style.display = 'block'; // Initially visible (expanded)

  // Create color info
  const totalColors = Object.keys(colorCounts).length;
  const totalCount = Object.values(colorCounts).reduce((sum, count) => sum + count, 0);

  const info = document.createElement('div');
  info.textContent = `${totalColors} colors, ${totalCount} blocks`;
  info.style.fontSize = '12px';
  info.style.marginBottom = '8px';
  info.style.color = '#666';

  colorPanelElement.appendChild(info);

  // Create color buttons container
  const colorButtonsContainer = document.createElement('div');
  colorButtonsContainer.id = 'color-buttons-container';

  // Create color buttons
  // Sort colors by count in descending order
  const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);

  // DEBUG: 显示前10个颜色信息
  console.log("=== 前10个颜色信息 ===");
  sortedColors.slice(0, 10).forEach(([color, count], index) => {
    const isInPalette = paletteColorsSet.has(color);
    console.log(`  ${index + 1}. ${color} (${count}) ${isInPalette ? '✓' : '⚠️'}`);
  });

  // Create color buttons
  for (const [color, count] of sortedColors) {
    const colorButton = document.createElement('div');
    colorButton.style.display = 'flex';
    colorButton.style.alignItems = 'center';
    colorButton.style.marginBottom = '4px';
    colorButton.style.padding = '4px';
    colorButton.style.borderRadius = '3px';
    colorButton.style.cursor = 'pointer';
    colorButton.style.transition = 'background-color 0.2s';
    colorButton.style.fontSize = '12px';

    colorButton.addEventListener('mouseenter', () => {
      colorButton.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });

    colorButton.addEventListener('mouseleave', () => {
      colorButton.style.backgroundColor = 'transparent';
    });

    // Color swatch
    const swatch = document.createElement('div');
    swatch.style.width = '16px';
    swatch.style.height = '16px';
    swatch.style.backgroundColor = color;
    swatch.style.border = '1px solid #ccc';
    swatch.style.borderRadius = '2px';
    swatch.style.marginRight = '8px';

    // Color info
    const colorInfo = document.createElement('div');
    colorInfo.textContent = `${color} (${count})`;
    colorInfo.style.flex = '1';

    colorButton.appendChild(swatch);
    colorButton.appendChild(colorInfo);

    // Add click event to filter by this color
    colorButton.addEventListener('click', () => {
      // Highlight selected color
      const allButtons = colorButtonsContainer.querySelectorAll('div[style*="flex"]');
      allButtons?.forEach(btn => {
        (btn as HTMLElement).style.fontWeight = 'normal';
      });
      colorButton.style.fontWeight = 'bold';

      // Store current color filter
      (window as any).currentColorFilter = color;

      // Redraw canvas with only this color
      const canvas = overlayElement?.querySelector('canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.onload = function () {
            // Get current scale from the zoom slider
            const currentScale = parseFloat((document.getElementById('zoom-slider') as HTMLInputElement)?.value) || 1.0;
            redrawCanvasWithColorBlocks(canvas, ctx, img, pixelScale, currentScale, color);
          };
          img.src = (window as any).currentPixelArtDataUrl || '';
        }
      }

      // Try to click the corresponding color button in @5.txt
      tryClickColorButtonInAt5(color);
    });

    colorButtonsContainer.appendChild(colorButton);
  }

  colorPanelElement.appendChild(colorButtonsContainer);

  // Add elements to wrapper
  colorPanelWrapper.appendChild(titleContainer);
  colorPanelWrapper.appendChild(colorPanelElement);

  // Add toggle functionality to title
  title.addEventListener('click', (e) => {
    // Toggle visibility of color buttons container
    if (colorPanelElement) {
      const display = colorPanelElement.style.display;
      colorPanelElement.style.display = display === 'none' ? 'block' : 'none';
      toggleButton.textContent = display === 'none' ? '▲' : '▼'; // Up arrow for collapse, down for expand
    }
  });

  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering the title container click event
    // Toggle visibility of color buttons container
    if (colorPanelElement) {
      const display = colorPanelElement.style.display;
      colorPanelElement.style.display = display === 'none' ? 'block' : 'none';
      toggleButton.textContent = display === 'none' ? '▲' : '▼'; // Up arrow for collapse, down for expand
    }
  });

  // Add color panel to control panel
  if (controlPanelElement) {
    controlPanelElement.appendChild(colorPanelWrapper);
  }
};

// Function to create and manage the save locations panel
const createSaveLocationsPanel = () => {
  console.log('Creating save locations panel');
  
  // Remove existing save locations panel if any
  if (saveLocationsPanelElement) {
    console.log('Removing existing save locations panel element');
    // Remove event listeners to prevent memory leaks and unexpected behavior
    if (activeLocationPanelDragListeners) {
      document.removeEventListener('mousemove', locationPanelGlobalDragHandler);
      document.removeEventListener('mouseup', locationPanelGlobalDragEndHandler);
      activeLocationPanelDragListeners = false;
    }
    saveLocationsPanelElement.remove();
  }

  // Create save locations panel
  console.log('Creating new save locations panel element');
  saveLocationsPanelElement = document.createElement('div');
  saveLocationsPanelElement.id = 'wplace-professor-save-locations-panel';
  saveLocationsPanelElement.style.position = 'fixed';
  saveLocationsPanelElement.style.left = '20px';
  saveLocationsPanelElement.style.top = '210px'; // Changed to 210px
  saveLocationsPanelElement.style.zIndex = '99997';
  saveLocationsPanelElement.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  saveLocationsPanelElement.style.padding = '12px';
  saveLocationsPanelElement.style.borderRadius = '6px';
  saveLocationsPanelElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  saveLocationsPanelElement.style.fontFamily = 'Arial, sans-serif';
  saveLocationsPanelElement.style.minWidth = '200px';
  saveLocationsPanelElement.style.width = '200px';
  saveLocationsPanelElement.style.maxWidth = '200px';
  saveLocationsPanelElement.style.fontSize = '14px';
  saveLocationsPanelElement.style.display = 'flex';
  saveLocationsPanelElement.style.flexDirection = 'column';
  saveLocationsPanelElement.style.boxSizing = 'border-box';
  saveLocationsPanelElement.style.userSelect = 'none';

  // State for panel minimized/maximized
  // When creating the panel, always initialize it as expanded (not minimized)
  let isPanelMinimized = false;
  console.log('Save locations panel initialized with isPanelMinimized:', isPanelMinimized);
  
  // Save the initial state to localStorage to ensure consistency
  try {
    localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({ isMinimized: false }));
    console.log('Initial save locations panel state saved to localStorage:', { isMinimized: false });
  } catch (e) {
    if (__DEV__) {
      console.error('Error saving initial panel state:', e);
    }
  }

  // Create panel header with title and toggle button
  console.log('Creating panel header');
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const title = document.createElement('h3');
  title.textContent = 'Location'; // Changed from 'Saved Locations'
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';

  const toggleButton = document.createElement('button');
  toggleButton.textContent = '−'; // Minimize symbol
  toggleButton.style.background = 'none';
  toggleButton.style.border = '1px solid #ccc';
  toggleButton.style.borderRadius = '3px';
  toggleButton.style.padding = '2px 6px';
  toggleButton.style.cursor = 'pointer';
  toggleButton.style.fontSize = '14px';
  toggleButton.style.fontWeight = 'bold';
  toggleButton.title = 'Minimize/Maximize panel';

  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const previousState = isPanelMinimized;
    isPanelMinimized = !isPanelMinimized;
    
    console.log(`Save locations panel toggle button clicked. State changed from ${previousState} to ${isPanelMinimized}`);
    
    // Save panel state to localStorage
    try {
      localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({ isMinimized: isPanelMinimized }));
      console.log('Save locations panel state saved to localStorage:', { isMinimized: isPanelMinimized });
    } catch (e) {
      if (__DEV__) {
        console.error('Error saving panel state:', e);
      }
    }

    if (isPanelMinimized) {
      // Minimize panel - keep same width as Control panel when minimized
      console.log('Minimizing save locations panel');
      saveLocationsPanelElement!.style.minWidth = '40px';
      saveLocationsPanelElement!.style.width = '40px';
      saveLocationsPanelElement!.style.maxWidth = '40px';
      saveLocationsPanelElement!.style.padding = '8px';
      header.style.marginBottom = '0';
      title.textContent = 'L'; // Show only first letter
      toggleButton.textContent = '+'; // Maximize symbol
      console.log('Set title text to:', title.textContent);
      console.log('Set toggle button text to:', toggleButton.textContent);

      // Adjust header styles to match Control panel when minimized
      header.style.justifyContent = 'center'; // Center content
      title.style.flex = '1'; // Allow title to grow
      title.style.textAlign = 'left'; // Align text to left
      toggleButton.style.marginLeft = 'auto'; // Push toggle button to the right

      // Hide content elements container
      const contentContainer = saveLocationsPanelElement!.querySelector('.save-locations-content-container');
      if (contentContainer) {
        (contentContainer as HTMLElement).style.display = 'none';
      }
      console.log('Finished minimizing save locations panel');
    } else {
      // Maximize panel
      console.log('Maximizing save locations panel');
      saveLocationsPanelElement!.style.minWidth = '180px';
      saveLocationsPanelElement!.style.width = '180px';
      saveLocationsPanelElement!.style.maxWidth = '180px';
      saveLocationsPanelElement!.style.padding = '12px';
      header.style.marginBottom = '8px';
      title.textContent = 'Location'; // Restore full title
      toggleButton.textContent = '−'; // Minimize symbol
      console.log('Set title text to:', title.textContent);
      console.log('Set toggle button text to:', toggleButton.textContent);

      // Reset header styles to default
      header.style.justifyContent = 'space-between'; // Reset to default
      title.style.flex = ''; // Reset flex property
      title.style.textAlign = ''; // Reset text alignment
      toggleButton.style.marginLeft = ''; // Reset margin

      // Show content elements container
      const contentContainer = saveLocationsPanelElement!.querySelector('.save-locations-content-container');
      if (contentContainer) {
        (contentContainer as HTMLElement).style.display = '';
        // Ensure social buttons container is grid
        const socialButtonsContainer = contentContainer.querySelector('.social-buttons-container');
        if (socialButtonsContainer) {
          (socialButtonsContainer as HTMLElement).style.display = 'grid';
          // Reset font sizes that might have been changed when minimized
          const socialButtons = socialButtonsContainer.querySelectorAll('button');
          socialButtons.forEach(button => {
            (button as HTMLElement).style.fontSize = '13px';
            (button as HTMLElement).style.padding = '6px';
          });
        }
        
        // Reset font sizes for save and download buttons
        const saveBtn = contentContainer.querySelector('button');
        const downloadBtn = saveBtn?.nextElementSibling as HTMLButtonElement | null;
        if (saveBtn) {
          saveBtn.style.fontSize = '13px';
          saveBtn.style.padding = '6px 10px';
        }
        if (downloadBtn) {
          downloadBtn.style.fontSize = '13px';
          downloadBtn.style.padding = '6px 10px';
        }
      }

      // Refresh the saved locations list
      refreshSavedLocationsList();
      console.log('Finished maximizing save locations panel');
    }
  });

  // Add click event to title for toggling when minimized
  title.addEventListener('click', (e) => {
    // Don't expand panel when clicking on 'C' or 'L' in minimized state
    // Only the toggle button (+/-) should control expansion
    if (isPanelMinimized) {
      console.log('Save locations panel title clicked in minimized state, ignoring');
      // Do nothing - let the user click the toggle button to expand
    }
  });

  header.appendChild(title);
  header.appendChild(toggleButton);
  saveLocationsPanelElement.appendChild(header);

  // Create save current location button
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save'; // Changed from 'Save Current Location'
  saveButton.style.background = '#4CAF50';
  saveButton.style.color = 'white';
  saveButton.style.border = 'none';
  saveButton.style.borderRadius = '3px';
  saveButton.style.width = '100%';
  saveButton.style.padding = '8px 12px'; // Increase padding to make button taller
  saveButton.style.fontSize = '14px'; // Slightly increase font size
  saveButton.style.fontWeight = 'bold'; // Make text bold
  // saveButton.style.flex = '1'; // Remove flex grow
  // saveButton.style.marginRight = '4px'; // Remove margin

  // Create share card
  const shareCard = document.createElement('div');
  shareCard.style.marginTop = '8px';
  shareCard.style.border = '1px solid #ddd';
  shareCard.style.borderRadius = '4px';
  shareCard.style.backgroundColor = 'rgba(245, 245, 245, 0.9)';
  
  // Create social media sharing buttons container
  const socialButtonsContainer = document.createElement('div');
  socialButtonsContainer.className = 'social-buttons-container'; // Add class for querying
  socialButtonsContainer.style.display = 'grid';
  socialButtonsContainer.style.gridTemplateColumns = '1fr 1fr 1fr 1fr'; // 4 columns for icons
  socialButtonsContainer.style.gap = '4px';
  socialButtonsContainer.style.padding = '8px';

  // Add buttons container to the card
  shareCard.appendChild(socialButtonsContainer);

  // Social media icons data (simplified paths for demonstration)
  // In a real implementation, you would use actual SVG paths from Lucide Icons
  // Social media icons data from Simple Icons (react-icons/si)
  const socialPlatforms = [
    { 
      name: 'Twitter', 
      label: 'Twitter', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
      </svg>`, 
      color: '#1DA1F2' 
    },
    { 
      name: 'Facebook', 
      label: 'Facebook', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>`, 
      color: '#1877F2' 
    },
    { 
      name: 'Reddit', 
      label: 'Reddit', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
      </svg>`, 
      color: '#FF4500' 
    },
    { 
      name: 'LinkedIn', 
      label: 'LinkedIn', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>`, 
      color: '#0A66C2' 
    },
    { 
      name: 'Pinterest', 
      label: 'Pinterest', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z"/>
      </svg>`, 
      color: '#BD081C' 
    },
    { 
      name: 'Tumblr', 
      label: 'Tumblr', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.547 17.334q-1.297 0-1.941-.961-.531-.811-.531-2.195V9.451h3.844V6.385H9.703q.021-.729.063-1.271.083-1.083.292-1.906.208-.823.583-1.489.375-.667.927-1.146.552-.479 1.302-.729.75-.25 1.708-.25.958 0 1.729.26.771.261 1.323.771.552.51.875 1.281.323.771.417 1.844l1.719-.552q-.209-1.219-.854-2.083-.646-.865-1.636-1.344-.99-.479-2.208-.479-1.156 0-2.094.333-.937.334-1.614.948-.677.615-1.073 1.511-.396.896-.531 2.031-.063.521-.094 1.094-.031.573-.042 1.219H7.27V12.5h2.25v4.625q0 1.625.51 2.823.511 1.198 1.438 1.989.927.792 2.26 1.198 1.333.406 3.031.406 1.698 0 2.959-.344 1.26-.344 2.135-.989.875-.646 1.396-1.573.521-.927.719-2.083.198-1.157.198-2.542v-7.25h-3.219v1.031q-.625-.937-1.641-1.416-1.016-.48-2.291-.48z"/>
      </svg>`, 
      color: '#36465D' 
    },
    { 
      name: 'WhatsApp', 
      label: 'WhatsApp', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>`, 
      color: '#25D366' 
    },
    { 
      name: 'Telegram', 
      label: 'Telegram', 
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.14.141-.259.259-.374.261l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.136-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
      </svg>`, 
      color: '#0088CC' 
    }
  ];

  socialPlatforms.forEach(platform => {
    const button = document.createElement('button');
    button.title = platform.label; // Show full name on hover
    button.style.background = platform.color;
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '3px';
    button.style.padding = '6px'; // Reduced padding for icons
    button.style.cursor = 'pointer';
    button.style.fontSize = '13px'; // Kept font size
    button.style.width = '100%';
    button.style.aspectRatio = '1'; // Make buttons square
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    
    // Create SVG icon
    const iconContainer = document.createElement('div');
    iconContainer.innerHTML = platform.icon;
    button.appendChild(iconContainer);
    
    button.addEventListener('click', async () => {
      try {
        console.log('Social media button clicked:', platform.name);
        
        // 查找分享按钮
        const shareButtons = document.querySelectorAll('button.btn.btn-primary.btn-soft');
        let shareButton: Element | null = null;
        
        // 查找包含"Share"文本的按钮
        for (let i = 0; i < shareButtons.length; i++) {
          const button = shareButtons[i];
          if (button.textContent && button.textContent.trim() === 'Share') {
            shareButton = button;
            break;
          }
          const textNodes = Array.from(button.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
          if (textNodes.length > 0 && textNodes[0].textContent && textNodes[0].textContent.trim() === 'Share') {
            shareButton = button;
            break;
          }
        }
        
        // 如果没有找到分享按钮，立即显示错误信息
        if (!shareButton) {
          console.log('No share button found');
          showCustomAlertModal('Please select a pixel on the page first.');
          return;
        }
        
        // 点击分享按钮以触发图片生成
        console.log('Clicking share button to trigger image generation');
        (shareButton as HTMLElement).click();
        
        // 等待一段时间让图片加载
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 查找包含blob URL的<img>元素
        let imgElement: HTMLImageElement | null = null;
        const startTime = Date.now();
        const timeout = 5000; // 5秒超时
        
        // 循环查找blob图片，直到找到元素或超时
        while (!imgElement && (Date.now() - startTime) < timeout) {
          // 查找所有可能的blob图片元素
          const blobImages = document.querySelectorAll('img[src^="blob:"]');
          if (blobImages.length > 0) {
            // 选择最后一个图片元素（最新的）
            imgElement = blobImages[blobImages.length - 1] as HTMLImageElement;
            console.log('Found blob image element:', imgElement.src);
            
            // 检查图片是否已经加载完成
            if (!imgElement.complete) {
              console.log('Image not yet loaded, waiting...');
              // 等待图片加载完成
              await new Promise<void>((resolve) => {
                // 设置最大等待时间
                const loadTimeout = setTimeout(() => {
                  console.log('Image load timeout, continuing anyway');
                  resolve();
                }, 3000);
                
                const loadHandler = () => {
                  clearTimeout(loadTimeout);
                  imgElement!.removeEventListener('load', loadHandler);
                  console.log('Image loaded successfully');
                  resolve();
                };
                
                const errorHandler = () => {
                  clearTimeout(loadTimeout);
                  imgElement!.removeEventListener('error', errorHandler);
                  console.log('Image failed to load');
                  resolve(); // 即使加载失败也继续，避免无限等待
                };
                
                imgElement!.addEventListener('load', loadHandler);
                imgElement!.addEventListener('error', errorHandler);
              });
            }
            break;
          }
          // 等待100毫秒再试
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (imgElement) {
          // 使用新的blob图片捕获功能
          await captureBlobImageToClipboard(imgElement.src);
          
          // 显示成功消息
          showClipboardSuccessModal();
          
          // 等待1秒后跳转到社交平台
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 获取当前页面URL
          const locationData = localStorage.getItem('location');
          let url = window.location.href;
          
          if (locationData) {
            try {
              const locationObj = JSON.parse(locationData);
              if (locationObj.lat && locationObj.lng && locationObj.zoom) {
                url = `https://wplace.live/?lat=${locationObj.lat}&lng=${locationObj.lng}&zoom=${locationObj.zoom}`;
              }
            } catch (e) {
              console.error('Error parsing location data:', e);
            }
          }
          
          // 生成社交平台分享URL
          let shareUrl = '';
          switch (platform.name) {
            case 'Twitter':
              shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`;
              break;
            case 'Facebook':
              shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
              break;
            case 'Reddit':
              shareUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}`;
              break;
            case 'LinkedIn':
              shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
              break;
            case 'Pinterest':
              shareUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}`;
              break;
            case 'Tumblr':
              shareUrl = `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${encodeURIComponent(url)}`;
              break;
            case 'WhatsApp':
              shareUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
              break;
            case 'Telegram':
              shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}`;
              break;
            default:
              showCustomAlertModal(`Unsupported platform: ${platform.name}`);
              return;
          }
          
          // 在新窗口中打开分享URL
          window.open(shareUrl, '_blank');
        } else {
          console.log('No blob image element found after timeout');
          showCustomAlertModal('Failed to generate image. Please try again.');
        }
      } catch (error) {
        console.error('Error capturing blob image:', error);
        showCustomAlertModal('Failed to capture image. Please try again.');
      }
    });
    socialButtonsContainer.appendChild(button);
  });

  // saveLocationsPanelElement.appendChild(socialButtonsContainer);

  // Create saved locations list container
  const listContainer = document.createElement('div');
  listContainer.id = 'saved-locations-list';
  listContainer.style.marginTop = '8px';
  listContainer.style.maxHeight = '200px';
  listContainer.style.overflowY = 'auto';
  // saveLocationsPanelElement.appendChild(listContainer);

  // Create a container for all content elements
  const contentContainer = document.createElement('div');
  contentContainer.className = 'save-locations-content-container'; // Add class for querying
  contentContainer.appendChild(saveButton); // Add save button
  // contentContainer.appendChild(shareButton); // Remove share button
  contentContainer.appendChild(shareCard); // Add share card
  contentContainer.appendChild(listContainer);
  
  // Create delete all locations button
  const deleteAllButton = document.createElement('button');
  deleteAllButton.textContent = 'Delete All';
  deleteAllButton.style.background = '#f44336';
  deleteAllButton.style.color = 'white';
  deleteAllButton.style.border = 'none';
  deleteAllButton.style.borderRadius = '3px';
  deleteAllButton.style.width = '100%';
  deleteAllButton.style.marginTop = '8px';
  deleteAllButton.style.padding = '6px 10px';
  deleteAllButton.style.cursor = 'pointer';
  deleteAllButton.style.fontSize = '13px';
  deleteAllButton.style.fontWeight = 'bold'; // Make text bold
  
  deleteAllButton.addEventListener('click', () => {
    // Use custom modal instead of alert
    showDeleteAllLocationsModal();
  });
  
  contentContainer.appendChild(deleteAllButton);
  
  saveLocationsPanelElement.appendChild(contentContainer);

  // Add event listeners
  saveButton.addEventListener('click', saveCurrentLocation);
  // downloadButton.addEventListener('click', downloadCurrentPage);

  // Add panel to document
  document.body.appendChild(saveLocationsPanelElement);
  console.log('Save locations panel added to document body');

  // Load saved locations
  refreshSavedLocationsList();

  // Make the panel draggable
  // Clean up any existing drag listeners
  if (activeLocationPanelDragListeners) {
    document.removeEventListener('mousemove', locationPanelGlobalDragHandler);
    document.removeEventListener('mouseup', locationPanelGlobalDragEndHandler);
    activeLocationPanelDragListeners = false;
  }
  
  // Set up drag state
  isLocationPanelDragging = false;
  locationPanelCurrentX = 0;
  locationPanelCurrentY = 0;
  locationPanelInitialX = 0;
  locationPanelInitialY = 0;
  locationPanelXOffset = 0;
  locationPanelYOffset = 0;
  
  // Attach event listeners for dragging
  saveLocationsPanelElement.addEventListener('mousedown', locationPanelGlobalDragStartHandler);
  document.addEventListener('mousemove', locationPanelGlobalDragHandler);
  document.addEventListener('mouseup', locationPanelGlobalDragEndHandler);
  activeLocationPanelDragListeners = true;

  // Prevent text selection when dragging
  saveLocationsPanelElement.addEventListener('selectstart', (e) => e.preventDefault());
};

// Function to show a custom modal for confirming delete all locations
const showDeleteAllLocationsModal = () => {
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'wplace-delete-all-locations-modal';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '100000';
  modal.style.userSelect = 'none'; // Prevent text selection on the backdrop

  // Create modal content - similar to control panel style
  const modalContent = document.createElement('div');
  modalContent.id = 'wplace-delete-all-locations-modal-content';
  modalContent.style.position = 'fixed';
  modalContent.style.top = '50%';
  modalContent.style.left = '50%';
  modalContent.style.transform = 'translate(-50%, -50%)';
  modalContent.style.zIndex = '100001';
  modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  modalContent.style.padding = '12px';
  modalContent.style.borderRadius = '6px';
  modalContent.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  modalContent.style.fontFamily = 'Arial, sans-serif';
  modalContent.style.minWidth = '200px';
  modalContent.style.fontSize = '14px';

  // Create title container with drag handle
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.marginBottom = '8px';
  titleContainer.style.cursor = 'move'; // Show that this area is draggable

  // Create title
  const title = document.createElement('h3');
  title.textContent = 'Delete All';
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';
  title.style.flex = '1';
  title.style.cursor = 'move'; // Also draggable

  titleContainer.appendChild(title);

  // Create message
  const message = document.createElement('div');
  message.textContent = 'Are you sure you want to delete all saved locations?';
  message.style.fontSize = '13px';
  message.style.marginBottom = '12px';
  message.style.color = '#555';

  // Create buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.justifyContent = 'flex-end';
  buttonsContainer.style.gap = '6px';

  // Create delete button
  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Delete';
  deleteButton.style.background = '#f44336';
  deleteButton.style.color = 'white';
  deleteButton.style.border = 'none';
  deleteButton.style.borderRadius = '3px';
  deleteButton.style.padding = '6px 10px';
  deleteButton.style.cursor = 'pointer';
  deleteButton.style.fontSize = '13px';

  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.background = '#e0e0e0';
  cancelButton.style.color = '#333';
  cancelButton.style.border = 'none';
  cancelButton.style.borderRadius = '3px';
  cancelButton.style.padding = '6px 10px';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.fontSize = '13px';

  // Add event listeners
  deleteButton.addEventListener('click', () => {
    localStorage.removeItem(SAVE_LOCATIONS_KEY);
    refreshSavedLocationsList();
    document.body.removeChild(modal);
  });

  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Allow closing with Escape key
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
    }
  });

  // Make the modal draggable like the control panel
  let isDragging = false;
  let currentX: number = 0;
  let currentY: number = 0;
  let initialX: number = 0;
  let initialY: number = 0;
  let xOffset = 0;
  let yOffset = 0;

  function dragStart(e: MouseEvent) {
    // Only drag when clicking on the title container or title
    if (e.target === titleContainer || e.target === title) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      isDragging = true;
      e.preventDefault(); // Prevent text selection
    }
  }

  function drag(e: MouseEvent) {
    if (isDragging) {
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, modalContent);
    }
  }

  function dragEnd() {
    initialX = currentX;
    initialY = currentY;

    isDragging = false;
  }

  function setTranslate(xPos: number, yPos: number, el: HTMLElement) {
    el.style.transform = `translate(calc(-50% + ${xPos}px), calc(-50% + ${yPos}px))`;
  }

  // Attach event listeners for dragging
  titleContainer.addEventListener('mousedown', dragStart);
  title.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Prevent text selection when dragging
  titleContainer.addEventListener('selectstart', (e) => e.preventDefault());
  title.addEventListener('selectstart', (e) => e.preventDefault());

  // Assemble modal
  modalContent.appendChild(titleContainer);
  modalContent.appendChild(message);
  modalContent.appendChild(buttonsContainer);
  
  buttonsContainer.appendChild(cancelButton);
  buttonsContainer.appendChild(deleteButton);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);
};

// Function to delete a saved location
const deleteSavedLocation = (id: string) => {
  const savedLocations = getSavedLocations();
  const filteredLocations = savedLocations.filter(location => location.id !== id);
  localStorage.setItem(SAVE_LOCATIONS_KEY, JSON.stringify(filteredLocations));
  refreshSavedLocationsList();
};

// Function to show a custom modal for confirming location deletion
const showDeleteLocationModal = (location: SavedLocation) => {
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'wplace-delete-location-modal';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '100000';
  modal.style.userSelect = 'none'; // Prevent text selection on the backdrop

  // Create modal content - similar to control panel style
  const modalContent = document.createElement('div');
  modalContent.id = 'wplace-delete-location-modal-content';
  modalContent.style.position = 'fixed';
  modalContent.style.top = '50%';
  modalContent.style.left = '50%';
  modalContent.style.transform = 'translate(-50%, -50%)';
  modalContent.style.zIndex = '100001';
  modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  modalContent.style.padding = '12px';
  modalContent.style.borderRadius = '6px';
  modalContent.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  modalContent.style.fontFamily = 'Arial, sans-serif';
  modalContent.style.minWidth = '200px';
  modalContent.style.fontSize = '14px';

  // Create title container with drag handle
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.marginBottom = '8px';
  titleContainer.style.cursor = 'move'; // Show that this area is draggable

  // Create title
  const title = document.createElement('h3');
  title.textContent = 'Delete Location';
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';
  title.style.flex = '1';
  title.style.cursor = 'move'; // Also draggable

  titleContainer.appendChild(title);

  // Create message
  const message = document.createElement('div');
  message.textContent = `Are you sure you want to delete "${location.name}"?`;
  message.style.fontSize = '13px';
  message.style.marginBottom = '12px';
  message.style.color = '#555';

  // Create buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.justifyContent = 'flex-end';
  buttonsContainer.style.gap = '6px';

  // Create delete button
  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Delete';
  deleteButton.style.background = '#f44336';
  deleteButton.style.color = 'white';
  deleteButton.style.border = 'none';
  deleteButton.style.borderRadius = '3px';
  deleteButton.style.padding = '6px 10px';
  deleteButton.style.cursor = 'pointer';
  deleteButton.style.fontSize = '13px';
  deleteButton.style.fontWeight = 'bold'; // Make text bold

  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.background = '#e0e0e0';
  cancelButton.style.color = '#333';
  cancelButton.style.border = 'none';
  cancelButton.style.borderRadius = '3px';
  cancelButton.style.padding = '6px 10px';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.fontSize = '13px';
  cancelButton.style.fontWeight = 'bold'; // Make text bold

  // Add event listeners
  deleteButton.addEventListener('click', () => {
    deleteSavedLocation(location.id);
    document.body.removeChild(modal);
  });

  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Allow closing with Escape key
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
    }
  });

  // Make the modal draggable like the control panel
  let isDragging = false;
  let currentX: number = 0;
  let currentY: number = 0;
  let initialX: number = 0;
  let initialY: number = 0;
  let xOffset = 0;
  let yOffset = 0;

  function dragStart(e: MouseEvent) {
    // Only drag when clicking on the title container or title
    if (e.target === titleContainer || e.target === title) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      isDragging = true;
      e.preventDefault(); // Prevent text selection
    }
  }

  function drag(e: MouseEvent) {
    if (isDragging) {
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, modalContent);
    }
  }

  function dragEnd() {
    initialX = currentX;
    initialY = currentY;

    isDragging = false;
  }

  function setTranslate(xPos: number, yPos: number, el: HTMLElement) {
    el.style.transform = `translate(calc(-50% + ${xPos}px), calc(-50% + ${yPos}px))`;
  }

  // Attach event listeners for dragging
  titleContainer.addEventListener('mousedown', dragStart);
  title.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Prevent text selection when dragging
  titleContainer.addEventListener('selectstart', (e) => e.preventDefault());
  title.addEventListener('selectstart', (e) => e.preventDefault());

  // Assemble modal
  modalContent.appendChild(titleContainer);
  modalContent.appendChild(message);
  modalContent.appendChild(buttonsContainer);
  
  buttonsContainer.appendChild(cancelButton);
  buttonsContainer.appendChild(deleteButton);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);
};

// Function to share to social media
const shareToSocialMedia = async (platform: string) => {
  // Check if share button exists by looking for a button with "Share" text
  const shareButtons = document.querySelectorAll('button.btn.btn-primary.btn-soft');
  let shareButton: Element | null = null;

  // Find the button with "Share" text
  for (let i = 0; i < shareButtons.length; i++) {
    const button = shareButtons[i];
    // Check if the button contains the text "Share"
    if (button.textContent && button.textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
    // Check if the button has a text node with "Share"
    const textNodes = Array.from(button.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    if (textNodes.length > 0 && textNodes[0].textContent && textNodes[0].textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
  }

  // If no share button, show custom modal to prompt user to select a pixel
  if (!shareButton) {
    showCustomAlertModal('Please select a pixel on the page first.');
    return;
  }

  // Get location data from localStorage
  const locationData = localStorage.getItem('location');
  if (!locationData) {
    showCustomAlertModal('No location data found. Please select a pixel on the page first.');
    return;
  }

  let locationObj;
  try {
    locationObj = JSON.parse(locationData);
  } catch (e) {
    console.error('Error parsing location data:', e);
    showCustomAlertModal('Error reading location data. Please try again.');
    return;
  }

  // Validate location data
  if (!locationObj.lat || !locationObj.lng || !locationObj.zoom) {
    showCustomAlertModal('Invalid location data. Please select a pixel on the page first.');
    return;
  }

  // Construct URL from location data
  const url = `https://wplace.live/?lat=${locationObj.lat}&lng=${locationObj.lng}&zoom=${locationObj.zoom}`;

  // Click the share button silently to get the blob image
  try {
    // Temporarily hide the modal dialog
    const dialog = document.querySelector('dialog.modal') as HTMLElement;
    if (dialog) {
      dialog.style.opacity = '0';
      dialog.style.pointerEvents = 'none';
      dialog.style.visibility = 'hidden';
    }

    // Create a Promise to capture the blob image from the network request
    const blobPromise = new Promise<Blob>((resolve, reject) => {
      // Store the original fetch function
      const originalFetch = window.fetch;
      
      // Override fetch to intercept blob requests
      window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
          // Check if this is a blob response from wplace.live
          if (response.url.startsWith('blob:https://wplace.live/')) {
            // Clone the response to get the blob data
            response.clone().blob().then(blob => {
              resolve(blob);
            }).catch(err => {
              console.error('Error getting blob from response:', err);
              reject(err);
            });
          }
          return response;
        });
      };
      
      // Also override XMLHttpRequest to intercept blob requests
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
        // @ts-ignore
        this._url = url; // Store the URL
        // @ts-ignore
        return originalXHROpen.call(this, method, url, async, username, password);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        // @ts-ignore
        this.addEventListener('load', function() {
          // @ts-ignore
          if (this.responseURL && this.responseURL.startsWith('blob:https://wplace.live/')) {
            try {
              // @ts-ignore
              const blob = new Blob([this.response], { type: this.getResponseHeader('Content-Type') });
              resolve(blob);
            } catch (err) {
              console.error('Error creating blob from XHR response:', err);
              reject(err);
            }
          }
        });
        // @ts-ignore
        return originalXHRSend.apply(this, args);
      };
      
      // Set a timeout to reject the promise if no blob is found
      setTimeout(() => {
        reject(new Error('Timeout waiting for blob image'));
      }, 5000);
    });

    // Click the share button
    (shareButton as HTMLElement).click();

    // Wait for the blob image from the network request
    const blob = await blobPromise;

    // Restore the original fetch and XMLHttpRequest functions
    // Note: We don't actually restore them because they might be needed elsewhere
    // In a production environment, you might want to be more careful about this

    // Write to clipboard
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
    } else {
      throw new Error('Clipboard API not supported');
    }

    // Show success message
    showClipboardSuccessModal();

    // Wait 1 second before opening share URL
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restore dialog visibility
    if (dialog) {
      dialog.style.opacity = '';
      dialog.style.pointerEvents = '';
      dialog.style.visibility = '';
      dialog.removeAttribute('open');
    }

    // Generate share URL based on platform
    let shareUrl = '';
    switch (platform) {
      case 'Twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`;
        break;
      case 'Facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case 'Reddit':
        shareUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}`;
        break;
      case 'LinkedIn':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        break;
      case 'Pinterest':
        shareUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}`;
        break;
      case 'Tumblr':
        shareUrl = `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${encodeURIComponent(url)}`;
        break;
      case 'WhatsApp':
        shareUrl = `https://wa.me/?${encodeURIComponent(url)}`;
        break;
      case 'Telegram':
        shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}`;
        break;
      default:
        showCustomAlertModal(`Unsupported platform: ${platform}`);
        return;
    }

    // Open share URL in new window
    window.open(shareUrl, '_blank');
  } catch (error) {
    console.error('Error sharing to social media:', error);
    
    // Restore dialog visibility in case of error
    const dialog = document.querySelector('dialog.modal') as HTMLElement;
    if (dialog) {
      dialog.style.opacity = '';
      dialog.style.pointerEvents = '';
      dialog.style.visibility = '';
      dialog.removeAttribute('open');
    }
    
    showCustomAlertModal('Failed to share to social media. Please try again.');
  }
};

const getSavedLocations = (): SavedLocation[] => {
  try {
    const savedLocationsStr = localStorage.getItem(SAVE_LOCATIONS_KEY);
    return savedLocationsStr ? JSON.parse(savedLocationsStr) : [];
  } catch (e) {
    if (__DEV__) {
      console.error('Error parsing saved locations:', e);
    }
    return [];
  }
};
// Function to refresh the saved locations list
const refreshSavedLocationsList = () => {
  const listContainer = document.getElementById('saved-locations-list');
  if (!listContainer) return;

  // Clear the list
  listContainer.innerHTML = '';

  // Get saved locations
  const savedLocations = getSavedLocations();

  // If no saved locations, show a message
  if (savedLocations.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.textContent = 'No saved locations';
    emptyMessage.style.color = '#666';
    emptyMessage.style.fontSize = '12px';
    emptyMessage.style.textAlign = 'center';
    emptyMessage.style.padding = '8px';
    listContainer.appendChild(emptyMessage);
    return;
  }

  // Add each saved location to the list
  savedLocations.forEach(location => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '4px';
    item.style.borderBottom = '1px solid #eee';

    const info = document.createElement('div');
    info.style.flex = '1';
    info.style.minWidth = '0'; // Allow text truncation

    const name = document.createElement('div');
    name.textContent = location.name;
    name.style.fontSize = '13px';
    name.style.fontWeight = 'bold';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';

    const time = document.createElement('div');
    time.textContent = new Date(location.timestamp).toLocaleString();
    time.style.fontSize = '11px';
    time.style.color = '#666';

    info.appendChild(name);
    info.appendChild(time);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '4px';

    // Open button
    const openButton = document.createElement('button');
    openButton.textContent = 'Open';
    openButton.style.background = '#4CAF50';
    openButton.style.color = 'white';
    openButton.style.border = 'none';
    openButton.style.borderRadius = '3px';
    openButton.style.padding = '2px 6px';
    openButton.style.cursor = 'pointer';
    openButton.style.fontSize = '11px';
    openButton.style.fontWeight = 'bold'; // Make text bold
    openButton.addEventListener('click', () => {
      window.open(location.url, '_blank');
    });

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.style.background = '#f44336';
    deleteButton.style.color = 'white';
    deleteButton.style.border = 'none';
    deleteButton.style.borderRadius = '3px';
    deleteButton.style.padding = '2px 6px';
    deleteButton.style.cursor = 'pointer';
    deleteButton.style.fontSize = '11px';
    deleteButton.style.fontWeight = 'bold'; // Make text bold
    deleteButton.addEventListener('click', () => {
      showDeleteLocationModal(location);
    });

    buttonsContainer.appendChild(openButton);
    buttonsContainer.appendChild(deleteButton);

    item.appendChild(info);
    item.appendChild(buttonsContainer);

    listContainer.appendChild(item);
  });
};
// Function to save current location
const saveCurrentLocation = async () => {
  // Check if share button exists by looking for a button with "Share" text
  const shareButtons = document.querySelectorAll('button.btn.btn-primary.btn-soft');
  let shareButton: Element | null = null;

  // Find the button with "Share" text
  for (let i = 0; i < shareButtons.length; i++) {
    const button = shareButtons[i];
    // Check if the button contains the text "Share"
    if (button.textContent && button.textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
    // Check if the button has a text node with "Share"
    const textNodes = Array.from(button.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    if (textNodes.length > 0 && textNodes[0].textContent && textNodes[0].textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
  }

  // If no share button, show custom modal to prompt user to select a pixel
  if (!shareButton) {
    showCustomAlertModal('Please select a pixel on the page first.');
    return;
  }

  // Get location data from localStorage
  const locationData = localStorage.getItem('location');
  if (!locationData) {
    showCustomAlertModal('No location data found. Please select a pixel on the page first.');
    return;
  }

  let locationObj;
  try {
    locationObj = JSON.parse(locationData);
  } catch (e) {
    console.error('Error parsing location data:', e);
    showCustomAlertModal('Error reading location data. Please try again.');
    return;
  }

  // Validate location data
  if (!locationObj.lat || !locationObj.lng || !locationObj.zoom) {
    showCustomAlertModal('Invalid location data. Please select a pixel on the page first.');
    return;
  }

  // Construct URL from location data
  const url = `https://wplace.live/?lat=${locationObj.lat}&lng=${locationObj.lng}&zoom=${locationObj.zoom}`;

  // Prompt user for a name using a custom modal
  showLocationNameModal(url, null);
};

// Function to show a custom modal for entering location name
const showLocationNameModal = (url: string, shareButton: Element | null) => {
  console.log('showLocationNameModal called');

  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'wplace-location-name-modal';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '100000';
  modal.style.userSelect = 'none'; // Prevent text selection on the backdrop

  // Create modal content - similar to control panel style
  const modalContent = document.createElement('div');
  modalContent.id = 'wplace-location-name-modal-content';
  modalContent.style.position = 'fixed';
  modalContent.style.top = '50%';
  modalContent.style.left = '50%';
  modalContent.style.transform = 'translate(-50%, -50%)';
  modalContent.style.zIndex = '100001';
  modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  modalContent.style.padding = '12px';
  modalContent.style.borderRadius = '6px';
  modalContent.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  modalContent.style.fontFamily = 'Arial, sans-serif';
  modalContent.style.minWidth = '200px';
  modalContent.style.fontSize = '14px';

  // Create title container with drag handle
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.marginBottom = '8px';
  titleContainer.style.cursor = 'move'; // Show that this area is draggable

  // Create title
  const title = document.createElement('h3');
  title.textContent = 'Save';
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';
  title.style.flex = '1';
  title.style.cursor = 'move'; // Also draggable

  titleContainer.appendChild(title);

  // Create input label
  const label = document.createElement('div');
  label.textContent = 'Enter a name for this location:';
  label.style.fontSize = '13px';
  label.style.marginBottom = '4px';
  label.style.color = '#555';

  // Create input field
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = MAX_NAME_LENGTH;
  input.placeholder = `Max ${MAX_NAME_LENGTH} characters`;
  input.style.width = '100%';
  input.style.padding = '6px';
  input.style.border = '1px solid #ccc';
  input.style.borderRadius = '3px';
  input.style.fontSize = '13px';
  input.style.marginBottom = '8px';
  input.style.boxSizing = 'border-box';

  // Set default value to current date
  const defaultValue = new Date().toISOString().replace(/T.*/, '').replace(/-/g, '');
  input.value = defaultValue;

  // Create buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.justifyContent = 'flex-end';
  buttonsContainer.style.gap = '6px';

  // Create save button
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save';
  saveButton.style.background = '#4CAF50';
  saveButton.style.color = 'white';
  saveButton.style.border = 'none';
  saveButton.style.borderRadius = '3px';
  saveButton.style.padding = '6px 10px';
  saveButton.style.cursor = 'pointer';
  saveButton.style.fontSize = '13px';

  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.background = '#f44336';
  cancelButton.style.color = 'white';
  cancelButton.style.border = 'none';
  cancelButton.style.borderRadius = '3px';
  cancelButton.style.padding = '6px 10px';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.fontSize = '13px';

  // Add event listeners
  saveButton.addEventListener('click', () => {
    const locationName = input.value.trim();
    if (locationName) {
      saveLocationWithName(url, locationName);
    }
    // Close the custom modal
    document.body.removeChild(modal);
  });

  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Allow saving with Enter key
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const locationName = input.value.trim();
      if (locationName) {
        saveLocationWithName(url, locationName);
      }
      document.body.removeChild(modal);
    }
  });

  // Allow closing with Escape key
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
    }
  });

  // Make the modal draggable like the control panel
  let isDragging = false;
  let currentX: number = 0;
  let currentY: number = 0;
  let initialX: number = 0;
  let initialY: number = 0;
  let xOffset = 0;
  let yOffset = 0;

  function dragStart(e: MouseEvent) {
    // Only drag when clicking on the title container or title
    if (e.target === titleContainer || e.target === title) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      isDragging = true;
      e.preventDefault(); // Prevent text selection
    }
  }

  function drag(e: MouseEvent) {
    if (isDragging) {
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, modalContent);
    }
  }

  function dragEnd() {
    initialX = currentX;
    initialY = currentY;

    isDragging = false;
  }

  function setTranslate(xPos: number, yPos: number, el: HTMLElement) {
    el.style.transform = `translate(calc(-50% + ${xPos}px), calc(-50% + ${yPos}px))`;
  }

  // Attach event listeners for dragging
  titleContainer.addEventListener('mousedown', dragStart);
  title.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Prevent text selection when dragging
  titleContainer.addEventListener('selectstart', (e) => e.preventDefault());
  title.addEventListener('selectstart', (e) => e.preventDefault());

  // Assemble modal
  modalContent.appendChild(titleContainer);
  modalContent.appendChild(label);
  modalContent.appendChild(input);
  modalContent.appendChild(buttonsContainer);
  
  buttonsContainer.appendChild(cancelButton);
  buttonsContainer.appendChild(saveButton);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Focus the input field
  input.focus();
};

// Function to show a custom alert modal
const showCustomAlertModal = (message: string) => {
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'wplace-custom-alert-modal';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '100000';
  modal.style.userSelect = 'none'; // Prevent text selection on the backdrop

  // Create modal content - similar to control panel style
  const modalContent = document.createElement('div');
  modalContent.id = 'wplace-custom-alert-modal-content';
  modalContent.style.position = 'fixed';
  modalContent.style.top = '50%';
  modalContent.style.left = '50%';
  modalContent.style.transform = 'translate(-50%, -50%)';
  modalContent.style.zIndex = '100001';
  modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  modalContent.style.padding = '12px';
  modalContent.style.borderRadius = '6px';
  modalContent.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  modalContent.style.fontFamily = 'Arial, sans-serif';
  modalContent.style.minWidth = '200px';
  modalContent.style.fontSize = '14px';

  // Create title container with drag handle
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.marginBottom = '8px';
  titleContainer.style.cursor = 'move'; // Show that this area is draggable

  // Create title
  const title = document.createElement('h3');
  title.textContent = 'Notice';
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';
  title.style.flex = '1';
  title.style.cursor = 'move'; // Also draggable

  titleContainer.appendChild(title);

  // Create message
  const messageDiv = document.createElement('div');
  messageDiv.textContent = message;
  messageDiv.style.fontSize = '13px';
  messageDiv.style.marginBottom = '12px';
  messageDiv.style.color = '#555';

  // Create OK button
  const okButton = document.createElement('button');
  okButton.textContent = 'OK';
  okButton.style.background = '#4CAF50';
  okButton.style.color = 'white';
  okButton.style.border = 'none';
  okButton.style.borderRadius = '3px';
  okButton.style.padding = '6px 10px';
  okButton.style.cursor = 'pointer';
  okButton.style.fontSize = '13px';
  okButton.style.fontWeight = 'bold';
  okButton.style.float = 'right';

  // Add event listener
  okButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Allow closing with Escape key
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
    }
  });

  // Make the modal draggable like the control panel
  let isDragging = false;
  let currentX: number = 0;
  let currentY: number = 0;
  let initialX: number = 0;
  let initialY: number = 0;
  let xOffset = 0;
  let yOffset = 0;

  function dragStart(e: MouseEvent) {
    // Only drag when clicking on the title container or title
    if (e.target === titleContainer || e.target === title) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      isDragging = true;
      e.preventDefault(); // Prevent text selection
    }
  }

  function drag(e: MouseEvent) {
    if (isDragging) {
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, modalContent);
    }
  }

  function dragEnd() {
    initialX = currentX;
    initialY = currentY;

    isDragging = false;
  }

  function setTranslate(xPos: number, yPos: number, el: HTMLElement) {
    el.style.transform = `translate(calc(-50% + ${xPos}px), calc(-50% + ${yPos}px))`;
  }

  // Attach event listeners for dragging
  titleContainer.addEventListener('mousedown', dragStart);
  title.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Prevent text selection when dragging
  titleContainer.addEventListener('selectstart', (e) => e.preventDefault());
  title.addEventListener('selectstart', (e) => e.preventDefault());

  // Assemble modal
  modalContent.appendChild(titleContainer);
  modalContent.appendChild(messageDiv);
  modalContent.appendChild(okButton);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);
};

// Function to show clipboard success modal
const showClipboardSuccessModal = () => {
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'wplace-clipboard-success-modal';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '100000';
  modal.style.userSelect = 'none'; // Prevent text selection on the backdrop

  // Create modal content - similar to control panel style
  const modalContent = document.createElement('div');
  modalContent.id = 'wplace-clipboard-success-modal-content';
  modalContent.style.position = 'fixed';
  modalContent.style.top = '50%';
  modalContent.style.left = '50%';
  modalContent.style.transform = 'translate(-50%, -50%)';
  modalContent.style.zIndex = '100001';
  modalContent.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  modalContent.style.padding = '12px';
  modalContent.style.borderRadius = '6px';
  modalContent.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  modalContent.style.fontFamily = 'Arial, sans-serif';
  modalContent.style.minWidth = '200px';
  modalContent.style.fontSize = '14px';

  // Create title container with drag handle
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.marginBottom = '8px';
  titleContainer.style.cursor = 'move'; // Show that this area is draggable

  // Create title
  const title = document.createElement('h3');
  title.textContent = 'Success';
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';
  title.style.flex = '1';
  title.style.cursor = 'move'; // Also draggable

  titleContainer.appendChild(title);

  // Create message
  const messageDiv = document.createElement('div');
  messageDiv.textContent = 'Current location image has been copied to clipboard.';
  messageDiv.style.fontSize = '13px';
  messageDiv.style.marginBottom = '12px';
  messageDiv.style.color = '#555';

  // Assemble modal
  modalContent.appendChild(titleContainer);
  modalContent.appendChild(messageDiv);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Auto remove modal after 500ms
  setTimeout(() => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }, 500);
};

// Function to copy map canvas to clipboard
const copyMapCanvasToClipboard = async (): Promise<void> => {
  // Find the map canvas
  const mapCanvas = document.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement;
  if (!mapCanvas) {
    throw new Error('Map canvas not found');
  }

  // Check if Clipboard API is supported
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error('Clipboard API not supported');
  }

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    mapCanvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to convert canvas to blob'));
        return;
      }

      try {
        // Write to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 'image/png');
  });
};

// Function to show a custom modal for confirming delete all locations

// Function to share to a specific social media platform
const shareToSpecificSocialMedia = async (platform: string) => {
  // Check if share button exists by looking for a button with "Share" text
  const shareButtons = document.querySelectorAll('button.btn.btn-primary.btn-soft');
  let shareButton: Element | null = null;

  // Find the button with "Share" text
  for (let i = 0; i < shareButtons.length; i++) {
    const button = shareButtons[i];
    // Check if the button contains the text "Share"
    if (button.textContent && button.textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
    // Check if the button has a text node with "Share"
    const textNodes = Array.from(button.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    if (textNodes.length > 0 && textNodes[0].textContent && textNodes[0].textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
  }

  // If no share button, show custom modal to prompt user to select a pixel
  if (!shareButton) {
    showCustomAlertModal('Please select a pixel on the page first.');
    return;
  }

  // Get location data from localStorage
  const locationData = localStorage.getItem('location');
  if (!locationData) {
    showCustomAlertModal('No location data found. Please select a pixel on the page first.');
    return;
  }

  let locationObj;
  try {
    locationObj = JSON.parse(locationData);
  } catch (e) {
    console.error('Error parsing location data:', e);
    showCustomAlertModal('Error reading location data. Please try again.');
    return;
  }

  // Validate location data
  if (!locationObj.lat || !locationObj.lng || !locationObj.zoom) {
    showCustomAlertModal('Invalid location data. Please select a pixel on the page first.');
    return;
  }

  // Construct URL from location data
  const url = `https://wplace.live/?lat=${locationObj.lat}&lng=${locationObj.lng}&zoom=${locationObj.zoom}`;

  // Click the share button silently to get the blob image
  try {
    // Temporarily hide the modal dialog
    const dialog = document.querySelector('dialog.modal') as HTMLElement;
    if (dialog) {
      dialog.style.opacity = '0';
      dialog.style.pointerEvents = 'none';
      dialog.style.visibility = 'hidden';
    }

    // Create a Promise to capture the blob image from the network request
    const blobPromise = new Promise<Blob>((resolve, reject) => {
      // Store the original fetch function
      const originalFetch = window.fetch;
      
      // Override fetch to intercept blob requests
      window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
          // Check if this is a blob response from wplace.live
          if (response.url.startsWith('blob:https://wplace.live/')) {
            // Clone the response to get the blob data
            response.clone().blob().then(blob => {
              resolve(blob);
            }).catch(err => {
              console.error('Error getting blob from response:', err);
              reject(err);
            });
          }
          return response;
        });
      };
      
      // Also override XMLHttpRequest to intercept blob requests
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
        // @ts-ignore
        this._url = url; // Store the URL
        // @ts-ignore
        return originalXHROpen.call(this, method, url, async, username, password);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        // @ts-ignore
        this.addEventListener('load', function() {
          // @ts-ignore
          if (this.responseURL && this.responseURL.startsWith('blob:https://wplace.live/')) {
            try {
              // @ts-ignore
              const blob = new Blob([this.response], { type: this.getResponseHeader('Content-Type') });
              resolve(blob);
            } catch (err) {
              console.error('Error creating blob from XHR response:', err);
              reject(err);
            }
          }
        });
        // @ts-ignore
        return originalXHRSend.apply(this, args);
      };
      
      // Set a timeout to reject the promise if no blob is found
      setTimeout(() => {
        reject(new Error('Timeout waiting for blob image'));
      }, 5000);
    });

    // Click the share button
    (shareButton as HTMLElement).click();

    // Wait for the blob image from the network request
    const blob = await blobPromise;

    // Restore the original fetch and XMLHttpRequest functions
    // Note: We don't actually restore them because they might be needed elsewhere
    // In a production environment, you might want to be more careful about this

    // Write to clipboard
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
    } else {
      throw new Error('Clipboard API not supported');
    }

    // Show success message
    showClipboardSuccessModal();

    // Wait 1 second before opening share URL
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restore dialog visibility
    if (dialog) {
      dialog.style.opacity = '';
      dialog.style.pointerEvents = '';
      dialog.style.visibility = '';
      dialog.removeAttribute('open');
    }

    // Generate share URL based on platform
    let shareUrl = '';
    switch (platform) {
      case 'Twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`;
        break;
      case 'Facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case 'Reddit':
        shareUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}`;
        break;
      case 'LinkedIn':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        break;
      case 'Pinterest':
        shareUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}`;
        break;
      case 'Tumblr':
        shareUrl = `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${encodeURIComponent(url)}`;
        break;
      case 'WhatsApp':
        shareUrl = `https://wa.me/?${encodeURIComponent(url)}`;
        break;
      case 'Telegram':
        shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}`;
        break;
      default:
        showCustomAlertModal(`Unsupported platform: ${platform}`);
        return;
    }

    // Open share URL in new window
    window.open(shareUrl, '_blank');
  } catch (error) {
    console.error('Error sharing to social media:', error);
    
    // Restore dialog visibility in case of error
    const dialog = document.querySelector('dialog.modal') as HTMLElement;
    if (dialog) {
      dialog.style.opacity = '';
      dialog.style.pointerEvents = '';
      dialog.style.visibility = '';
      dialog.removeAttribute('open');
    }
    
    showCustomAlertModal('Failed to share to social media. Please try again.');
  }
};

// Function to save location with the provided name
const saveLocationWithName = (url: string, locationName: string) => {
  // Truncate name if too long
  if (locationName.length > MAX_NAME_LENGTH) {
    locationName = locationName.substring(0, MAX_NAME_LENGTH);
  }

  // Create saved location object
  const savedLocation: SavedLocation = {
    id: Date.now().toString(),
    name: locationName,
    timestamp: Date.now(),
    url: url
  };

  // Save to localStorage
  const savedLocations = getSavedLocations();
  savedLocations.unshift(savedLocation); // Add to beginning of array
  localStorage.setItem(SAVE_LOCATIONS_KEY, JSON.stringify(savedLocations));

  // Refresh the list
  refreshSavedLocationsList();

  // Show success message
  const successMessage = document.createElement('div');
  successMessage.textContent = `Location "${locationName}" saved successfully!`;
  successMessage.style.position = 'fixed';
  successMessage.style.bottom = '20px';
  successMessage.style.right = '20px';
  successMessage.style.backgroundColor = '#4CAF50';
  successMessage.style.color = 'white';
  successMessage.style.padding = '10px 20px';
  successMessage.style.borderRadius = '4px';
  successMessage.style.zIndex = '100001';
  successMessage.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
  document.body.appendChild(successMessage);

  // Remove success message after 3 seconds
  setTimeout(() => {
    if (successMessage.parentNode) {
      successMessage.parentNode.removeChild(successMessage);
    }
  }, 3000);
};

// Function to download current page
const downloadCurrentPage = async () => {
  // Check if share button exists by looking for a button with "Share" text
  const shareButtons = document.querySelectorAll('button.btn.btn-primary.btn-soft');
  let shareButton: Element | null = null;

  // Find the button with "Share" text
  for (let i = 0; i < shareButtons.length; i++) {
    const button = shareButtons[i];
    // Check if the button contains the text "Share"
    if (button.textContent && button.textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
    // Check if the button has a text node with "Share"
    const textNodes = Array.from(button.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    if (textNodes.length > 0 && textNodes[0].textContent && textNodes[0].textContent.trim() === 'Share') {
      shareButton = button;
      break;
    }
  }

  if (!shareButton) {
    alert('Please click the page share button first to enable this feature.');
    return;
  }

  // Simulate click on share button
  (shareButton as HTMLElement).click();

  // Wait a bit for the modal to appear and data to render
  await new Promise(resolve => setTimeout(resolve, 500));

  // Find and click the download button
  const downloadButton = document.querySelector('a.btn.btn-primary[download]') as HTMLAnchorElement;
  if (!downloadButton) {
    alert('Could not find download button. Please try again.');
    return;
  }

  // Simulate click on download button
  downloadButton.click();

  // Show success message
  alert('Download started!');
};

// Function to capture blob image and copy to clipboard
const captureBlobImageToClipboard = async (imageUrl: string): Promise<void> => {
  try {
    console.log('Capturing blob image:', imageUrl);
    
    // 使用fetch获取blob数据
    const response = await fetch(imageUrl);
    console.log('Fetch response status:', response.status);
    
    if (!response.ok) {
      throw new Error('Failed to fetch blob: ' + response.status);
    }
    
    const blob = await response.blob();
    console.log('Blob type:', blob.type, 'size:', blob.size);
    
    // 写入剪贴板
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      console.log('Blob image copied to clipboard');
    } else {
      throw new Error('Clipboard API not supported');
    }
  } catch (error) {
    console.error('Error capturing blob image:', error);
    throw error;
  }
};