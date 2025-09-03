// Utility function to simulate clicking the share button and hide the modal
export const simulateShareButtonClick = async (): Promise<{ url: string } | null> => {
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
    return null;
  }

  // Simulate click on share button
  (shareButton as HTMLElement).click();

  // Wait a bit for the modal to appear
  await new Promise(resolve => setTimeout(resolve, 500));

  // Get the URL from the input
  const urlInput = document.querySelector('input.text-base-content\\/80.min-w-10.grow.text-sm.font-medium') as HTMLInputElement;
  if (!urlInput) {
    alert('Could not find URL input. Please try again.');
    return null;
  }

  const url = urlInput.value;
  
  // Close the modal by removing the open attribute
  const modal = document.querySelector('dialog.modal') as HTMLDialogElement;
  if (modal) {
    modal.removeAttribute('open');
  }

  return { url };
};