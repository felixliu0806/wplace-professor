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
const placeOverlay = (dataUrl: string, clickX: number, clickY: number) => {
  // Remove existing overlay if any
  if (overlayElement) {
    overlayElement.remove();
  }

  // Create overlay container
  overlayElement = document.createElement('div');
  overlayElement.id = 'wplace-professor-overlay';
  overlayElement.style.position = 'absolute';
  overlayElement.style.left = '0';
  overlayElement.style.top = '0';
  overlayElement.style.pointerEvents = 'none'; // So it doesn't interfere with clicks
  overlayElement.style.zIndex = '99999';
  overlayElement.style.width = '100%';
  overlayElement.style.height = '100%';
  
  // Create image element for the pixel art
  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.position = 'absolute';
  img.style.left = `${clickX}px`;
  img.style.top = `${clickY}px`;
  img.style.transform = 'translate(-50%, -50%)'; // Center the image on the click point
  img.style.pointerEvents = 'none';
  img.style.maxWidth = '200px'; // Limit size
  img.style.maxHeight = '200px';
  
  overlayElement.appendChild(img);
  document.body.appendChild(overlayElement);
  
  console.log('Overlay placed at', clickX, clickY);
};

// Function to remove the overlay
const removeOverlay = () => {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
  if (colorPanelElement) {
    colorPanelElement.remove();
    colorPanelElement = null;
  }
};

// Function to create and show the color panel
const showColorPanel = (counts: { [color: string]: number }) => {
  // Remove existing panel if any
  if (colorPanelElement) {
    colorPanelElement.remove();
  }

  // Create color panel container
  colorPanelElement = document.createElement('div');
  colorPanelElement.id = 'wplace-professor-color-panel';
  colorPanelElement.style.position = 'fixed';
  colorPanelElement.style.bottom = '20px';
  colorPanelElement.style.right = '20px';
  colorPanelElement.style.backgroundColor = 'white';
  colorPanelElement.style.border = '1px solid #ccc';
  colorPanelElement.style.borderRadius = '8px';
  colorPanelElement.style.padding = '10px';
  colorPanelElement.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
  colorPanelElement.style.zIndex = '100000';
  colorPanelElement.style.maxHeight = '300px';
  colorPanelElement.style.overflowY = 'auto';
  
  // Create title
  const title = document.createElement('h3');
  title.textContent = 'Used Colors';
  title.style.marginTop = '0';
  colorPanelElement.appendChild(title);
  
  // Create color list
  const colorList = document.createElement('div');
  colorList.style.display = 'flex';
  colorList.style.flexDirection = 'column';
  colorList.style.gap = '5px';
  
  for (const [color, count] of Object.entries(counts)) {
    if (count > 0) { // Only show colors that are used
      const colorItem = document.createElement('div');
      colorItem.style.display = 'flex';
      colorItem.style.alignItems = 'center';
      colorItem.style.gap = '5px';
      
      const colorBox = document.createElement('div');
      colorBox.style.width = '20px';
      colorBox.style.height = '20px';
      colorBox.style.backgroundColor = color;
      colorBox.style.border = '1px solid #ccc';
      colorBox.style.borderRadius = '4px';
      
      const colorText = document.createElement('span');
      colorText.textContent = `${color}: ${count}`;
      colorText.style.fontSize = '14px';
      
      colorItem.appendChild(colorBox);
      colorItem.appendChild(colorText);
      colorList.appendChild(colorItem);
    }
  }
  
  colorPanelElement.appendChild(colorList);
  document.body.appendChild(colorPanelElement);
};

// Set up click listener for overlay placement
const setupOverlayPlacement = () => {
  const handleClick = (event: MouseEvent) => {
    if (pixelArtDataUrl) {
      placeOverlay(pixelArtDataUrl, event.clientX, event.clientY);
      showColorPanel(colorCounts);
      // Remove the listener after placing the overlay
      document.removeEventListener('click', handleClick);
    }
  };

  document.addEventListener('click', handleClick);
  
  console.log("Click on the page to place the overlay");
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
