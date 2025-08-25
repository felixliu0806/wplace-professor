// State for the overlay and color panel
let overlayElement: HTMLDivElement | null = null;
let colorPanelElement: HTMLDivElement | null = null;
let pixelArtDataUrl: string | null = null;
let colorCounts: { [color: string]: number } = {};

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

// Function to create and place the overlay
const placeOverlay = (dataUrl: string) => {
  // Remove existing overlay if any
  if (overlayElement) {
    overlayElement.remove();
  }

  // Create overlay container
  overlayElement = document.createElement('div');
  overlayElement.id = 'wplace-professor-overlay';
  overlayElement.style.position = 'fixed';
  overlayElement.style.left = '50%';
  overlayElement.style.top = '50%';
  overlayElement.style.transform = 'translate(-50%, -50%)';
  overlayElement.style.zIndex = '99999';
  overlayElement.style.cursor = 'move';
  overlayElement.style.userSelect = 'none';
  overlayElement.style.pointerEvents = 'none'; // Allow clicks to pass through to the canvas below
  
  // Create header for dragging and closing (positioned absolutely)
  const header = document.createElement('div');
  header.style.position = 'absolute';
  header.style.top = '-30px';
  header.style.right = '0';
  header.style.display = 'flex';
  header.style.gap = '5px';
  header.style.pointerEvents = 'auto'; // Enable pointer events for controls
  
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = '-';
  zoomOutBtn.style.background = 'rgba(255, 255, 255, 0.8)';
  zoomOutBtn.style.border = '1px solid #ccc';
  zoomOutBtn.style.borderRadius = '3px';
  zoomOutBtn.style.cursor = 'pointer';
  zoomOutBtn.style.width = '24px';
  zoomOutBtn.style.height = '24px';
  zoomOutBtn.style.display = 'flex';
  zoomOutBtn.style.alignItems = 'center';
  zoomOutBtn.style.justifyContent = 'center';
  zoomOutBtn.style.fontSize = '16px';
  zoomOutBtn.style.padding = '0';
  
  const zoomInBtn = document.createElement('button');
  zoomInBtn.textContent = '+';
  zoomInBtn.style.background = 'rgba(255, 255, 255, 0.8)';
  zoomInBtn.style.border = '1px solid #ccc';
  zoomInBtn.style.borderRadius = '3px';
  zoomInBtn.style.cursor = 'pointer';
  zoomInBtn.style.width = '24px';
  zoomInBtn.style.height = '24px';
  zoomInBtn.style.display = 'flex';
  zoomInBtn.style.alignItems = 'center';
  zoomInBtn.style.justifyContent = 'center';
  zoomInBtn.style.fontSize = '16px';
  zoomInBtn.style.padding = '0';
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.background = 'rgba(255, 255, 255, 0.8)';
  closeBtn.style.border = '1px solid #ccc';
  closeBtn.style.borderRadius = '3px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.width = '24px';
  closeBtn.style.height = '24px';
  closeBtn.style.display = 'flex';
  closeBtn.style.alignItems = 'center';
  closeBtn.style.justifyContent = 'center';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.padding = '0';
  
  header.appendChild(zoomOutBtn);
  header.appendChild(zoomInBtn);
  header.appendChild(closeBtn);
  
  // Create canvas for the pixel art
  const canvas = document.createElement('canvas');
  canvas.style.imageRendering = 'pixelated'; // For sharp pixel edges
  canvas.style.opacity = '0.7'; // Set transparency
  canvas.style.pointerEvents = 'none'; // Allow clicks to pass through to the canvas below
  
  overlayElement.appendChild(header);
  overlayElement.appendChild(canvas);
  document.body.appendChild(overlayElement);
  
  // Load image and draw it on canvas with pixel borders
  const img = new Image();
  img.onload = function() {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Set initial scale - 1:1 pixel ratio by default
      let scale = 1;
      
      // Set canvas size
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      
      // Draw image with pixel borders
      drawPixelArtWithBorders(ctx, img, scale);
      
      // Set up zoom controls
      let currentScale = scale;
      
      zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent dragging
        currentScale = Math.min(currentScale + 1, 20);
        redrawCanvasWithBorders(canvas, ctx, img, currentScale);
      });
      
      zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent dragging
        currentScale = Math.max(currentScale - 1, 1);
        redrawCanvasWithBorders(canvas, ctx, img, currentScale);
      });
    }
  };
  img.src = dataUrl;
  
  // Close button event
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dragging
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
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
  }
  
  function setTranslate(xPos: number, yPos: number, el: HTMLElement) {
    if (el) {
      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
  }
  
  console.log('Overlay placed at center of screen');
};

// Function to draw pixel art with borders
const drawPixelArtWithBorders = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, scale: number) => {
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
  
  // Draw each pixel with borders
  for (let y = 0; y < tempCanvas.height; y++) {
    for (let x = 0; x < tempCanvas.width; x++) {
      const i = (y * tempCanvas.width + x) * 4;
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
      
      // Draw pixel border (black border)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(pixelX, pixelY, scale, scale);
    }
  }
};

// Function to redraw canvas with new scale
const redrawCanvasWithBorders = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, img: HTMLImageElement, scale: number) => {
  // Set canvas size
  canvas.width = img.naturalWidth * scale;
  canvas.height = img.naturalHeight * scale;
  
  // Draw image with pixel borders
  drawPixelArtWithBorders(ctx, img, scale);
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
      if (request.pixelArtDataUrl && request.colorCounts) {
        pixelArtDataUrl = request.pixelArtDataUrl;
        colorCounts = request.colorCounts;
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
  
  // Remove any existing highlights
  const existingHighlights = document.querySelectorAll('.wplace-pixel-highlight, .wplace-pixel-highlight-container');
  existingHighlights.forEach(el => el.remove());
};
