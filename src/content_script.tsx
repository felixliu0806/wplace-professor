// State for the overlay and color panel
let overlayElement: HTMLDivElement | null = null;
let controlPanelElement: HTMLDivElement | null = null;
let colorPanelElement: HTMLDivElement | null = null;
let pixelArtDataUrl: string | null = null;
let colorCounts: { [color: string]: number } = {};
let scaledRef: string | null = null; // 新增的scaledRef属性

// Keep track of whether the listener is already set up
let isListenerSetUp = false;

// Function to detect available colors on wplace.live
const detectAvailableColors = (): string[] => {
  try {
    console.log('Detecting available colors...');
    
    // Directly look for the grid container with specific classes
    const gridContainer = document.querySelector('div.md\\:grid-cols-16.min-\\[100rem\\]\\:grid-cols-32.grid.grid-cols-8.xl\\:grid-cols-32.sm\\:grid-cols-16.gap-0\\.5.sm\\:gap-1');
    
    if (gridContainer) {
      console.log('Found grid container');
      
      // If grid container is found, get all color buttons from it
      const colorButtons = gridContainer.querySelectorAll('button[style*="background"]');
      console.log('Found color buttons:', colorButtons.length);
      
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
              console.log(`Button ${index}: Found color ${rgbMatch[1]}`);
            } else {
              console.log(`Button ${index}: No color match in style:`, style);
            }
          } else {
            console.log(`Button ${index}: No style attribute`);
          }
        } else {
          console.log(`Button ${index}: Locked (has lock icon)`);
        }
      });
      
      console.log('Detected available colors:', availableColors);
      return availableColors;
    } else {
      console.log('Grid container not found');
      // Let's try to find any grid container as fallback
      const anyGridContainer = document.querySelector('div.grid');
      if (anyGridContainer) {
        console.log('Found a grid container (fallback):', anyGridContainer);
        // Try to get color buttons from this fallback container
        const colorButtons = anyGridContainer.querySelectorAll('button[style*="background"]');
        console.log('Found color buttons (fallback):', colorButtons.length);
        
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
                console.log(`Button ${index}: Found color ${rgbMatch[1]} (fallback)`);
              } else {
                console.log(`Button ${index}: No color match in style (fallback):`, style);
              }
            } else {
              console.log(`Button ${index}: No style attribute (fallback)`);
            }
          } else {
            console.log(`Button ${index}: Locked (has lock icon) (fallback)`);
          }
        });
        
        console.log('Detected available colors (fallback):', availableColors);
        return availableColors;
      } else {
        console.log('No grid container found at all');
      }
    }
    
    // Fallback: If specific container or grid container is not found, 
    // or if we want to default to free palette, return an empty array
    // The SidePanel will handle the fallback to free palette
    console.log('Grid container not found, returning empty array for fallback to free palette');
    return [];
  } catch (error) {
    console.error('Error detecting available colors:', error);
    return [];
  }
};

// Function to draw a pixel block with border, padding, and center color
const drawPixelBlock = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  blockSize: number,
  color: string,
  drawCenter: boolean = true // Add parameter to control center color drawing
) => {
  // Draw the outer border (thin line)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, blockSize, blockSize);
  
  // For very small blocks, just fill with the color if drawing center
  if (blockSize <= 3) {
    if (drawCenter) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, blockSize, blockSize);
    }
    return;
  }
  
  // Calculate padding (10% of blockSize for padding on each side)
  const padding = Math.max(1, Math.floor(blockSize * 0.1));
  
  // Draw the inner area (padding area) in white or light gray
  const innerX = x + padding;
  const innerY = y + padding;
  const innerSize = blockSize - padding * 2;
  
  if (innerSize > 0) {
    ctx.fillStyle = '#f0f0f0'; // Light gray for padding area
    ctx.fillRect(innerX, innerY, innerSize, innerSize);
    
    // Draw the center color area (80% of blockSize) only if drawCenter is true
    if (drawCenter) {
      const centerPadding = Math.max(1, Math.floor(blockSize * 0.15)); // 15% padding for center area
      const centerX = x + centerPadding;
      const centerY = y + centerPadding;
      const centerSize = blockSize - centerPadding * 2;
      
      if (centerSize > 0) {
        ctx.fillStyle = color;
        ctx.fillRect(centerX, centerY, centerSize, centerSize);
      }
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
  
  // If we have scaled image data, use it directly
  if (scaledImageDataUrl) {
    const scaledImg = new Image();
    scaledImg.onload = function() {
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
          const drawCenter = !colorFilter || color === colorFilter;
          drawPixelBlock(blockCtx, blockX, blockY, blockSize, color, drawCenter);
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
    scaledImg.src = scaledImageDataUrl;
    return;
  }
  
  // Fallback to the original processing if no scaled image data is available
  // Custom pixelation logic without using pixelit.js
  // Step 1: Draw the image to the canvas
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  
  // Create a temporary canvas for processing
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;
  
  // Draw the original image
  tempCtx.drawImage(img, 0, 0);
  
  // Step 2: Pixelate the image by scaling down and then back up
  // Create a temporary canvas for scaling down
  const scaleTempCanvas = document.createElement('canvas');
  const scaleTempCtx = scaleTempCanvas.getContext('2d');
  if (!scaleTempCtx) return;
  
  // Disable image smoothing for pixel-perfect scaling
  (scaleTempCtx as any).mozImageSmoothingEnabled = false;
  (scaleTempCtx as any).webkitImageSmoothingEnabled = false;
  scaleTempCtx.imageSmoothingEnabled = false;
  
  // Calculate scaled dimensions
  const scaledWidth = Math.max(1, Math.round(img.naturalWidth * pixelScale));
  const scaledHeight = Math.max(1, Math.round(img.naturalHeight * pixelScale));
  
  // Set temp canvas dimensions
  scaleTempCanvas.width = scaledWidth;
  scaleTempCanvas.height = scaledHeight;
  
  // Draw scaled down image
  scaleTempCtx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
  
  // Clear main temp canvas and draw scaled up image
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  (tempCtx as any).mozImageSmoothingEnabled = false;
  (tempCtx as any).webkitImageSmoothingEnabled = false;
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(scaleTempCanvas, 0, 0, scaledWidth, scaledHeight, 0, 0, tempCanvas.width, tempCanvas.height);
  
  // Step 3: Apply color palette conversion
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;
  
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
    if (palette.length === 0) return actualColor;
    
    let selectedColor = palette[0];
    let currentSim = colorSim(actualColor, palette[0]);
    
    for (const color of palette) {
      const nextColor = colorSim(actualColor, color);
      if (nextColor <= currentSim) {
        selectedColor = color;
        currentSim = nextColor;
      }
    }
    return selectedColor;
  };
  
  // Apply palette conversion to each pixel
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const i = y * 4 * imageData.width + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      // Skip transparent pixels
      if (a === 0) continue;
      
      // Find the most similar color in the palette
      const originalColor = [r, g, b];
      const finalColor = similarColor(originalColor);
      
      // Apply the final color
      data[i] = finalColor[0];
      data[i + 1] = finalColor[1];
      data[i + 2] = finalColor[2];
    }
  }
  
  // Put the modified image data back to the temp canvas
  tempCtx.putImageData(imageData, 0, 0);
  
  // Now draw each pixel as a block with border, padding, and center color
  // Create another temporary canvas for the block drawing
  const blockCanvas = document.createElement('canvas');
  const blockCtx = blockCanvas.getContext('2d');
  if (!blockCtx) return;
  
  // blockSize is the size of each pixel block in the final display
  // It's the ratio between original and scaled dimensions
  const pixelWidthRatio = originalImageWidth / scaledWidth;
  const blockSize = Math.round(pixelWidthRatio * scale);
  
  blockCanvas.width = Math.round(originalImageWidth * scale);
  blockCanvas.height = Math.round(originalImageHeight * scale);
  
  // Draw each pixel as a block, optionally filtered by color
  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      const i = y * 4 * scaledWidth + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      // Skip transparent pixels
      if (a === 0) continue;
      
      const color = `rgb(${r},${g},${b})`;
      
      // If a color filter is applied and this pixel doesn't match, skip it
      if (colorFilter && color !== colorFilter) {
        continue;
      }
      
      // Draw pixel block with border, padding, and center color
      const blockX = x * blockSize;
      const blockY = y * blockSize;
      
      // Always draw the full pixel block structure in this section (no color filter)
      drawPixelBlock(blockCtx, blockX, blockY, blockSize, color, true);
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
};

// Function to create color panel
const createColorPanel = (colorCounts: {[key: string]: number}, pixelScale: number) => {
  // Remove existing color panel if any
  if (colorPanelElement) {
    colorPanelElement.remove();
  }
  
  // Create color panel container
  colorPanelElement = document.createElement('div');
  colorPanelElement.id = 'wplace-professor-color-panel';
  colorPanelElement.style.marginTop = '15px';
  colorPanelElement.style.padding = '10px';
  colorPanelElement.style.border = '1px solid #ddd';
  colorPanelElement.style.borderRadius = '4px';
  colorPanelElement.style.backgroundColor = 'rgba(245, 245, 245, 0.9)';
  colorPanelElement.style.maxHeight = '200px';
  colorPanelElement.style.overflowY = 'auto';
  colorPanelElement.style.display = 'block'; // Initially visible (expanded)
  
  // Create color panel title with toggle button
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.justifyContent = 'space-between';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.marginBottom = '10px';
  titleContainer.style.cursor = 'pointer';
  
  const title = document.createElement('h4');
  title.textContent = 'Color Palette';
  title.style.margin = '0';
  title.style.fontSize = '14px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';
  
  const toggleButton = document.createElement('button');
  toggleButton.textContent = '▲'; // Up arrow for collapse (default expanded)
  toggleButton.style.background = 'none';
  toggleButton.style.border = 'none';
  toggleButton.style.fontSize = '12px';
  toggleButton.style.cursor = 'pointer';
  toggleButton.style.padding = '2px 6px';
  toggleButton.style.borderRadius = '3px';
  toggleButton.style.backgroundColor = '#e0e0e0';
  
  titleContainer.appendChild(title);
  titleContainer.appendChild(toggleButton);
  
  // Create color info
  const totalColors = Object.keys(colorCounts).length;
  const totalCount = Object.values(colorCounts).reduce((sum, count) => sum + count, 0);
  
  const info = document.createElement('div');
  info.textContent = `Colors: ${totalColors}, Total blocks: ${totalCount}`;
  info.style.fontSize = '11px';
  info.style.marginBottom = '10px';
  info.style.color = '#666';
  
  colorPanelElement.appendChild(titleContainer);
  colorPanelElement.appendChild(info);
  
  // Create color buttons container
  const colorButtonsContainer = document.createElement('div');
  colorButtonsContainer.id = 'color-buttons-container';
  
  // Create color buttons
  for (const [color, count] of Object.entries(colorCounts)) {
    const colorButton = document.createElement('div');
    colorButton.style.display = 'flex';
    colorButton.style.alignItems = 'center';
    colorButton.style.marginBottom = '5px';
    colorButton.style.padding = '5px';
    colorButton.style.borderRadius = '4px';
    colorButton.style.cursor = 'pointer';
    colorButton.style.transition = 'background-color 0.2s';
    
    colorButton.addEventListener('mouseenter', () => {
      colorButton.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });
    
    colorButton.addEventListener('mouseleave', () => {
      colorButton.style.backgroundColor = 'transparent';
    });
    
    // Color swatch
    const swatch = document.createElement('div');
    swatch.style.width = '20px';
    swatch.style.height = '20px';
    swatch.style.backgroundColor = color;
    swatch.style.border = '1px solid #ccc';
    swatch.style.borderRadius = '3px';
    swatch.style.marginRight = '10px';
    
    // Color info
    const colorInfo = document.createElement('div');
    colorInfo.textContent = `${color} (${count})`;
    colorInfo.style.fontSize = '12px';
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
          img.onload = function() {
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
  
  // Add toggle functionality
  titleContainer.addEventListener('click', (e) => {
    if (e.target !== toggleButton) {
      // Toggle visibility of color buttons container
      if (colorPanelElement) {
        const display = colorPanelElement.style.display;
        colorPanelElement.style.display = display === 'none' ? 'block' : 'none';
        toggleButton.textContent = display === 'none' ? '▲' : '▼'; // Up arrow for collapse, down for expand
      }
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
    controlPanelElement.appendChild(colorPanelElement);
  }
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
  // Remove existing overlay and control panel if any
  if (overlayElement) {
    overlayElement.remove();
  }
  if (controlPanelElement) {
    controlPanelElement.remove();
  }

  // Create overlay container
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
  const canvas = document.createElement('canvas');
  canvas.style.imageRendering = 'pixelated'; // For sharp pixel edges
  canvas.style.opacity = '0.9'; // Higher transparency
  canvas.style.pointerEvents = 'none'; // Allow clicks to pass through to the canvas below
  
  overlayElement.appendChild(canvas);
  document.body.appendChild(overlayElement);
  
  // Create separate control panel
  controlPanelElement = document.createElement('div');
  controlPanelElement.id = 'wplace-professor-control-panel';
  controlPanelElement.style.position = 'fixed';
  controlPanelElement.style.top = '20px';
  controlPanelElement.style.right = '20px';
  controlPanelElement.style.zIndex = '99999';
  controlPanelElement.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  controlPanelElement.style.padding = '15px';
  controlPanelElement.style.borderRadius = '8px';
  controlPanelElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  controlPanelElement.style.fontFamily = 'Arial, sans-serif';
  controlPanelElement.style.minWidth = '200px';
  
  // Create control panel title
  const title = document.createElement('h3');
  title.textContent = 'Overlay Controls';
  title.style.margin = '0 0 10px 0';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';
  title.style.color = '#333';
  
  // Create zoom slider
  const zoomLabel = document.createElement('div');
  zoomLabel.id = 'zoom-label';
  zoomLabel.textContent = 'Zoom: 1.00x';
  zoomLabel.style.fontSize = '14px';
  zoomLabel.style.marginBottom = '5px';
  zoomLabel.style.color = '#555';
  
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.id = 'zoom-slider';
  zoomSlider.min = '0.1';
  zoomSlider.max = '15.0'; // Increased from 5.0 to 15.0
  zoomSlider.step = '0.01';
  zoomSlider.value = '1.0';
  zoomSlider.style.width = '100%';
  zoomSlider.style.marginBottom = '5px';
  zoomSlider.style.cursor = 'pointer';
  
  // Create zoom buttons container
  const zoomButtonsContainer = document.createElement('div');
  zoomButtonsContainer.style.display = 'flex';
  zoomButtonsContainer.style.gap = '5px';
  zoomButtonsContainer.style.marginBottom = '10px';
  
  // Create zoom out button
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = '-';
  zoomOutBtn.style.flex = '1';
  zoomOutBtn.style.background = '#f0f0f0';
  zoomOutBtn.style.border = '1px solid #ccc';
  zoomOutBtn.style.borderRadius = '4px';
  zoomOutBtn.style.padding = '5px';
  zoomOutBtn.style.cursor = 'pointer';
  zoomOutBtn.style.fontSize = '16px';
  zoomOutBtn.style.fontWeight = 'bold';
  
  // Create zoom in button
  const zoomInBtn = document.createElement('button');
  zoomInBtn.textContent = '+';
  zoomInBtn.style.flex = '1';
  zoomInBtn.style.background = '#f0f0f0';
  zoomInBtn.style.border = '1px solid #ccc';
  zoomInBtn.style.borderRadius = '4px';
  zoomInBtn.style.padding = '5px';
  zoomInBtn.style.cursor = 'pointer';
  zoomInBtn.style.fontSize = '16px';
  zoomInBtn.style.fontWeight = 'bold';
  
  zoomButtonsContainer.appendChild(zoomOutBtn);
  zoomButtonsContainer.appendChild(zoomInBtn);
  
  // Create direction buttons container
  const directionButtonsContainer = document.createElement('div');
  directionButtonsContainer.style.display = 'grid';
  directionButtonsContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
  directionButtonsContainer.style.gridTemplateRows = 'repeat(3, 1fr)';
  directionButtonsContainer.style.gap = '5px';
  directionButtonsContainer.style.marginBottom = '10px';
  
  // Create direction buttons
  const upBtn = document.createElement('button');
  upBtn.textContent = '↑';
  upBtn.style.background = '#e0e0e0';
  upBtn.style.border = '1px solid #ccc';
  upBtn.style.borderRadius = '4px';
  upBtn.style.padding = '5px';
  upBtn.style.cursor = 'pointer';
  upBtn.style.fontSize = '14px';
  upBtn.style.fontWeight = 'bold';
  upBtn.style.gridRow = '1';
  upBtn.style.gridColumn = '2';
  
  const leftBtn = document.createElement('button');
  leftBtn.textContent = '←';
  leftBtn.style.background = '#e0e0e0';
  leftBtn.style.border = '1px solid #ccc';
  leftBtn.style.borderRadius = '4px';
  leftBtn.style.padding = '5px';
  leftBtn.style.cursor = 'pointer';
  leftBtn.style.fontSize = '14px';
  leftBtn.style.fontWeight = 'bold';
  leftBtn.style.gridRow = '2';
  leftBtn.style.gridColumn = '1';
  
  const rightBtn = document.createElement('button');
  rightBtn.textContent = '→';
  rightBtn.style.background = '#e0e0e0';
  rightBtn.style.border = '1px solid #ccc';
  rightBtn.style.borderRadius = '4px';
  rightBtn.style.padding = '5px';
  rightBtn.style.cursor = 'pointer';
  rightBtn.style.fontSize = '14px';
  rightBtn.style.fontWeight = 'bold';
  rightBtn.style.gridRow = '2';
  rightBtn.style.gridColumn = '3';
  
  const downBtn = document.createElement('button');
  downBtn.textContent = '↓';
  downBtn.style.background = '#e0e0e0';
  downBtn.style.border = '1px solid #ccc';
  downBtn.style.borderRadius = '4px';
  downBtn.style.padding = '5px';
  downBtn.style.cursor = 'pointer';
  downBtn.style.fontSize = '14px';
  downBtn.style.fontWeight = 'bold';
  downBtn.style.gridRow = '3';
  downBtn.style.gridColumn = '2';
  
  directionButtonsContainer.appendChild(upBtn);
  directionButtonsContainer.appendChild(leftBtn);
  directionButtonsContainer.appendChild(rightBtn);
  directionButtonsContainer.appendChild(downBtn);
  
  // Create mode toggle button
  const modeToggleBtn = document.createElement('button');
  modeToggleBtn.textContent = 'Enable Drag Mode';
  modeToggleBtn.style.background = '#4CAF50';
  modeToggleBtn.style.color = 'white';
  modeToggleBtn.style.border = 'none';
  modeToggleBtn.style.borderRadius = '4px';
  modeToggleBtn.style.padding = '8px 12px';
  modeToggleBtn.style.cursor = 'pointer';
  modeToggleBtn.style.fontSize = '14px';
  modeToggleBtn.style.width = '100%';
  modeToggleBtn.style.marginBottom = '10px';
  modeToggleBtn.style.fontWeight = 'bold';
  
  modeToggleBtn.addEventListener('mouseenter', () => {
    modeToggleBtn.style.background = '#45a049';
  });
  
  modeToggleBtn.addEventListener('mouseleave', () => {
    modeToggleBtn.style.background = '#4CAF50';
  });
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close Overlay';
  closeBtn.style.background = '#ff4444';
  closeBtn.style.color = 'white';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.padding = '8px 12px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '14px';
  closeBtn.style.width = '100%';
  closeBtn.style.fontWeight = 'bold';
  
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#cc3333';
  });
  
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = '#ff4444';
  });
  
  controlPanelElement.appendChild(title);
  controlPanelElement.appendChild(zoomLabel);
  controlPanelElement.appendChild(zoomSlider);
  controlPanelElement.appendChild(zoomButtonsContainer);
  controlPanelElement.appendChild(directionButtonsContainer);
  controlPanelElement.appendChild(modeToggleBtn);
  controlPanelElement.appendChild(closeBtn);
  document.body.appendChild(controlPanelElement);
  
  // Load image and draw it on canvas with pixel borders
  const img = new Image();
  img.onload = function() {
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
      if (scaledImageDataUrl) {
        const scaledImg = new Image();
        scaledImg.onload = function() {
          // Draw each pixel as a block with border, padding, and center color
          // Create another temporary canvas for the block drawing
          const blockCanvas = document.createElement('canvas');
          const blockCtx = blockCanvas.getContext('2d');
          if (!blockCtx) return;
          
          // Get the scaled image data
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) return;
          
          tempCanvas.width = scaledImg.naturalWidth;
          tempCanvas.height = scaledImg.naturalHeight;
          tempCtx.drawImage(scaledImg, 0, 0);
          
          const scaledImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const scaledData = scaledImageData.data;
          
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
              drawPixelBlock(blockCtx, blockX, blockY, blockSize, color, true);
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
          const colorCounts: {[key: string]: number} = {};
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
          
          // Set up smooth zoom control with slider
          zoomSlider.addEventListener('input', (e) => {
            const scale = parseFloat((e.target as HTMLInputElement).value);
            (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${scale.toFixed(2)}x`;
            // Redraw the image with new scale
            redrawCanvasWithColorBlocks(canvas, ctx, img, pixelScale, scale, (window as any).currentColorFilter);
          });
          
          // Set up zoom buttons with same behavior as slider
          const zoomStep = 0.01; // Step for zoom in/out buttons
          
          // Function to perform zoom with same behavior as slider
          const performZoom = (newScale: number) => {
            // Update slider and label
            zoomSlider.value = newScale.toString();
            (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${newScale.toFixed(2)}x`;
            
            // Redraw the image with new scale
            redrawCanvasWithColorBlocks(canvas, ctx, img, pixelScale, newScale, (window as any).currentColorFilter);
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
        };
        scaledImg.src = scaledImageDataUrl;
      } else {
        // Fallback to the original processing if no scaled image data is available
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
        const scaledWidth = Math.max(1, Math.round(img.naturalWidth * pixelScale));
        const scaledHeight = Math.max(1, Math.round(img.naturalHeight * pixelScale));
        
        // Set temp canvas dimensions
        tempCanvas.width = scaledWidth;
        tempCanvas.height = scaledHeight;
        
        // Draw scaled down image
        tempCtx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
        
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
          if (palette.length === 0) return actualColor;
          
          let selectedColor = palette[0];
          let currentSim = colorSim(actualColor, palette[0]);
          
          for (const color of palette) {
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
          }
        }
        
        // Put the modified image data back to the temp canvas
        tempCtx.putImageData(scaledImageData, 0, 0);
        
        // Step 3: Scale back up to original size by manually expanding each pixel
        // Set canvas dimensions to match original image
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Clear main canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Calculate the upscale ratio
        const upscaleRatioX = img.naturalWidth / scaledWidth;
        const upscaleRatioY = img.naturalHeight / scaledHeight;
        
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
            
            // Fill the expanded pixel
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
          }
        }
        
        // Now draw each pixel as a block with border, padding, and center color
        // Create another temporary canvas for the block drawing
        const blockCanvas = document.createElement('canvas');
        const blockCtx = blockCanvas.getContext('2d');
        if (!blockCtx) return;
        
        // blockSize is the size of each pixel block in the final display
        // It's the ratio between original and scaled dimensions
        const originalImageWidth = (window as any).originalImageWidth || img.naturalWidth;
        const originalImageHeight = (window as any).originalImageHeight || img.naturalHeight;
        const pixelWidthRatio = originalImageWidth / scaledWidth;
        const blockSize = Math.round(pixelWidthRatio * 1.0); // Default scale factor of 1.0
        
        blockCanvas.width = Math.round(originalImageWidth * 1.0);
        blockCanvas.height = Math.round(originalImageHeight * 1.0);
        
        // Draw each pixel as a block with border, padding, and center color
        for (let y = 0; y < scaledHeight; y++) {
          for (let x = 0; x < scaledWidth; x++) {
            const i = y * 4 * scaledWidth + x * 4;
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
            drawPixelBlock(blockCtx, blockX, blockY, blockSize, color, true);
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
        const colorCounts: {[key: string]: number} = {};
        for (let y = 0; y < scaledHeight; y++) {
          for (let x = 0; x < scaledWidth; x++) {
            const i = y * 4 * scaledWidth + x * 4;
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
        
        // Set up smooth zoom control with slider
        zoomSlider.addEventListener('input', (e) => {
          const scale = parseFloat((e.target as HTMLInputElement).value);
          (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${scale.toFixed(2)}x`;
          // Redraw the image with new scale
          redrawCanvasWithColorBlocks(canvas, ctx, img, pixelScale, scale, (window as any).currentColorFilter);
        });
        
        // Set up zoom buttons with same behavior as slider
        const zoomStep = 0.01; // Step for zoom in/out buttons
        
        // Function to perform zoom with same behavior as slider
        const performZoom = (newScale: number) => {
          // Update slider and label
          zoomSlider.value = newScale.toString();
          (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${newScale.toFixed(2)}x`;
          
          // Redraw the image with new scale
          redrawCanvasWithColorBlocks(canvas, ctx, img, pixelScale, newScale, (window as any).currentColorFilter);
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
      }
    }
  };
  img.src = dataUrl;
  
  // Mode toggle button event
  let isDragMode = false;
  modeToggleBtn.addEventListener('click', () => {
    isDragMode = !isDragMode;
    if (overlayElement) {
      if (isDragMode) {
        // Enable drag mode - allow interaction with overlay
        overlayElement.style.pointerEvents = 'auto';
        modeToggleBtn.textContent = 'Disable Drag Mode';
        modeToggleBtn.style.background = '#ff9800';
      } else {
        // Disable drag mode - ignore overlay for clicks
        overlayElement.style.pointerEvents = 'none';
        modeToggleBtn.textContent = 'Enable Drag Mode';
        modeToggleBtn.style.background = '#4CAF50';
      }
    }
  });
  
  // Direction buttons event handlers
  const moveStep = 1; // 1 pixel movement step
  
  upBtn.addEventListener('click', () => {
    if (overlayElement) {
      const currentTransform = overlayElement.style.transform;
      // Match both translate(x, y) and translate3d(x, y, z) formats
      const translateMatch = currentTransform.match(/translate3?d?\(([^,]+)px, ([^,]+)px/);
      if (translateMatch) {
        const currentX = parseFloat(translateMatch[1]);
        const currentY = parseFloat(translateMatch[2]);
        overlayElement.style.transform = `translate3d(${currentX}px, ${currentY - moveStep}px, 0)`;
      } else {
        // If no transform exists, set initial transform
        overlayElement.style.transform = `translate3d(0px, ${-moveStep}px, 0)`;
      }
    }
  });
  
  downBtn.addEventListener('click', () => {
    if (overlayElement) {
      const currentTransform = overlayElement.style.transform;
      // Match both translate(x, y) and translate3d(x, y, z) formats
      const translateMatch = currentTransform.match(/translate3?d?\(([^,]+)px, ([^,]+)px/);
      if (translateMatch) {
        const currentX = parseFloat(translateMatch[1]);
        const currentY = parseFloat(translateMatch[2]);
        overlayElement.style.transform = `translate3d(${currentX}px, ${currentY + moveStep}px, 0)`;
      } else {
        // If no transform exists, set initial transform
        overlayElement.style.transform = `translate3d(0px, ${moveStep}px, 0)`;
      }
    }
  });
  
  leftBtn.addEventListener('click', () => {
    if (overlayElement) {
      const currentTransform = overlayElement.style.transform;
      // Match both translate(x, y) and translate3d(x, y, z) formats
      const translateMatch = currentTransform.match(/translate3?d?\(([^,]+)px, ([^,]+)px/);
      if (translateMatch) {
        const currentX = parseFloat(translateMatch[1]);
        const currentY = parseFloat(translateMatch[2]);
        overlayElement.style.transform = `translate3d(${currentX - moveStep}px, ${currentY}px, 0)`;
      } else {
        // If no transform exists, set initial transform
        overlayElement.style.transform = `translate3d(${-moveStep}px, 0px, 0)`;
      }
    }
  });
  
  rightBtn.addEventListener('click', () => {
    if (overlayElement) {
      const currentTransform = overlayElement.style.transform;
      // Match both translate(x, y) and translate3d(x, y, z) formats
      const translateMatch = currentTransform.match(/translate3?d?\(([^,]+)px, ([^,]+)px/);
      if (translateMatch) {
        const currentX = parseFloat(translateMatch[1]);
        const currentY = parseFloat(translateMatch[2]);
        overlayElement.style.transform = `translate3d(${currentX + moveStep}px, ${currentY}px, 0)`;
      } else {
        // If no transform exists, set initial transform
        overlayElement.style.transform = `translate3d(${moveStep}px, 0px, 0)`;
      }
    }
  });
  
  // Close button event
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
    if (controlPanelElement) {
      controlPanelElement.remove();
      controlPanelElement = null;
    }
  });
  
  // Make the overlay draggable
  let isDragging = false;
  let currentX: number;
  let currentY: number;
  let initialX: number;
  let initialY: number;
  let xOffset = 0;
  let yOffset = 0;
  
  overlayElement.addEventListener('mousedown', dragStart);
  overlayElement.addEventListener('touchstart', dragStart);
  
  document.addEventListener('mousemove', drag);
  document.addEventListener('touchmove', drag);
  
  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('touchend', dragEnd);
  
  function dragStart(e: MouseEvent | TouchEvent) {
    // Only drag when clicking on the overlay itself, not on controls
    if (e.target === overlayElement || e.target === canvas) {
      if (e.type === 'touchstart') {
        initialX = (e as TouchEvent).touches[0].clientX - xOffset;
        initialY = (e as TouchEvent).touches[0].clientY - yOffset;
      } else {
        initialX = (e as MouseEvent).clientX - xOffset;
        initialY = (e as MouseEvent).clientY - yOffset;
      }
      
      isDragging = true;
    }
  }
  
  function drag(e: MouseEvent | TouchEvent) {
    if (isDragging) {
      e.preventDefault();
      
      if (e.type === 'touchmove') {
        currentX = (e as TouchEvent).touches[0].clientX - initialX;
        currentY = (e as TouchEvent).touches[0].clientY - initialY;
      } else {
        currentX = (e as MouseEvent).clientX - initialX;
        currentY = (e as MouseEvent).clientY - initialY;
      }
      
      xOffset = currentX;
      yOffset = currentY;
      
      if (overlayElement) {
        setTranslate(currentX, currentY, overlayElement);
      }
    }
  }
  
  function dragEnd() {
    initialX = currentX;
    initialY = currentY;
    
    isDragging = false;
    
    // Update base position after dragging
    // updateBasePosition(); // This function is not defined in this scope
  }
  
  function setTranslate(xPos: number, yPos: number, el: HTMLElement) {
    if (el) {
      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
  }
  
  console.log('Overlay placed at center of screen with separate control panel');
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
      if (request.pixelArtDataUrl && request.colorCounts) {
        pixelArtDataUrl = request.pixelArtDataUrl;
        colorCounts = request.colorCounts;
        // Store the pixelScale, pixelArtDataUrl, scaledImageDataUrl, palette, and original image dimensions for use in drawing functions
        (window as any).currentPixelScale = request.pixelScale || 1;
        (window as any).currentPixelArtDataUrl = request.pixelArtDataUrl;
        (window as any).currentScaledImageDataUrl = request.scaledImageDataUrl || null;
        (window as any).currentPalette = request.palette || [];
        (window as any).originalImageWidth = request.originalImageWidth || 0;
        (window as any).originalImageHeight = request.originalImageHeight || 0;
        setupOverlayPlacement();
        sendResponse({ status: "Ready for overlay placement" });
      } else {
        sendResponse({ status: "Error: Missing pixelArtDataUrl or colorCounts" });
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
console.log('WPlace Professor Content Script loaded');

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
    controlPanelElement.remove();
    controlPanelElement = null;
  }
  
  // Remove any existing highlights
  const existingHighlights = document.querySelectorAll('.wplace-pixel-highlight, .wplace-pixel-highlight-container');
  existingHighlights.forEach(el => el.remove());
};