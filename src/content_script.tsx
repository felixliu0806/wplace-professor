// State for the overlay and color panel
let overlayElement: HTMLDivElement | null = null;
let controlPanelElement: HTMLDivElement | null = null;
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

// Function to redraw grid pattern with new scale
const redrawGridPattern = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, gridSize: number, cellSize: number) => {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Update canvas size with precise dimensions
  canvas.width = Math.max(1, Math.round(gridSize * cellSize));
  canvas.height = Math.max(1, Math.round(gridSize * cellSize));
  
  // Set image smoothing for better quality
  ctx.imageSmoothingEnabled = false; // Keep pixelated look
  
  // Redraw grid pattern with smooth scaling
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      // Create a checkerboard pattern with lighter colors and higher transparency
      const color = (x + y) % 2 === 0 ? 'rgba(255, 150, 150, 0.4)' : 'rgba(150, 150, 255, 0.4)'; // Even lighter colors with 40% opacity
      ctx.fillStyle = color;
      
      // Calculate precise positions and dimensions using floating point arithmetic
      const xPos = x * cellSize;
      const yPos = y * cellSize;
      const width = cellSize;
      const height = cellSize;
      
      ctx.fillRect(xPos, yPos, width, height);
    }
  }
  
  // Redraw grid lines with subpixel precision
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; // Lighter grid lines with transparency
  ctx.lineWidth = 1;
  
  // Vertical lines
  for (let x = 0; x <= gridSize; x++) {
    const xPos = x * cellSize;
    ctx.beginPath();
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, gridSize * cellSize);
    ctx.stroke();
  }
  
  // Horizontal lines
  for (let y = 0; y <= gridSize; y++) {
    const yPos = y * cellSize;
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(gridSize * cellSize, yPos);
    ctx.stroke();
  }
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
  overlayElement.style.left = '0px';
  overlayElement.style.top = '0px';
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
  zoomSlider.max = '5.0';
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
  controlPanelElement.appendChild(modeToggleBtn);
  controlPanelElement.appendChild(closeBtn);
  document.body.appendChild(controlPanelElement);
  
  // Create a grid pattern instead of using the image
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Set fixed dimensions for the grid (e.g., 16x16 pixels)
    const gridSize = 16;
    const baseCellSize = 20; // Base size of each cell in pixels
    
    // Initial drawing
    redrawGridPattern(canvas, ctx, gridSize, baseCellSize * parseFloat(zoomSlider.value));
    
    // Set up smooth zoom control with slider
    zoomSlider.addEventListener('input', (e) => {
      const scale = parseFloat((e.target as HTMLInputElement).value);
      (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${scale.toFixed(2)}x`;
      redrawGridPattern(canvas, ctx, gridSize, baseCellSize * scale);
    });
    
    // Set up zoom buttons and slider
    const zoomStep = 0.01; // Step for zoom in/out buttons
    
    // Function to perform zoom
    const performZoom = (newScale: number) => {
      // Update UI and redraw
      zoomSlider.value = newScale.toString();
      (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${newScale.toFixed(2)}x`;
      redrawGridPattern(canvas, ctx, gridSize, baseCellSize * newScale);
      // Position is handled by drag, so we don't need to adjust it here
    };
    
    // Zoom in button
    zoomInBtn.addEventListener('click', () => {
      const currentScale = parseFloat(zoomSlider.value);
      const newScale = Math.min(currentScale + zoomStep, 5.0);
      performZoom(newScale);
    });
    
    // Zoom out button
    zoomOutBtn.addEventListener('click', () => {
      const currentScale = parseFloat(zoomSlider.value);
      const newScale = Math.max(currentScale - zoomStep, 0.1);
      performZoom(newScale);
    });
    
    // Slider input
    zoomSlider.addEventListener('input', (e) => {
      const scale = parseFloat((e.target as HTMLInputElement).value);
      (document.getElementById('zoom-label') as HTMLElement).textContent = `Zoom: ${scale.toFixed(2)}x`;
      redrawGridPattern(canvas, ctx, gridSize, baseCellSize * scale);
    });
  }
  
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
  // Create a dummy data URL for the overlay (not used in the new implementation)
  const dummyDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  placeOverlay(dummyDataUrl);
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
        // Store the pixelScale for use in drawing functions
        (window as any).currentPixelScale = request.pixelScale || 1;
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