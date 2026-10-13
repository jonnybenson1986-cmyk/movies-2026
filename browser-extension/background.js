/* Close navigation-created popups as a second layer behind the page guard. */
chrome.webNavigation.onCreatedNavigationTarget.addListener(async details => {
  try {
    const frame = await chrome.webNavigation.getFrame({ tabId: details.sourceTabId, frameId: details.sourceFrameId });
    const host = new URL(frame?.url || '').hostname;
    if (/(^|\.)(movy\.sx|vidy\.st|vidlink\.pro|moviesapi\.to|player\.videasy\.net|vidnest\.fun)$/.test(host)) await chrome.tabs.remove(details.tabId);
  } catch { /* The source or popup may have already closed. */ }
});
