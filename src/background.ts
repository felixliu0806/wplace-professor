// Keep the background script alive
chrome.runtime.onStartup.addListener(() => {
  console.log("WPlace Professor background script started");
});

// Listen for the extension icon to be clicked
chrome.action.onClicked.addListener((tab) => {
  // Open the side panel
  if (tab && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Keep the background script alive with periodic polling
function polling() {
  // console.log("polling");
  setTimeout(polling, 1000 * 30);
}

polling();
