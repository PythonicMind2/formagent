// FormAgent Bridge — runs on the FormAgent WEBSITE
(function() {
  "use strict";
  console.log("[FormAgent Bridge] loaded");

  window.postMessage({ type: "FA_EXT_READY", version: "1.0.0" }, "*");

  window.addEventListener("message", function(e) {
    if (!e.data) return;

    // Relay fill request to background
    if (e.data.type === "FA_FILL_REQUEST") {
      console.log("[FormAgent Bridge] relaying fill request");
      chrome.runtime.sendMessage({ action: "FILL_FORM", data: e.data.data }, function(response) {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: "FA_FILL_RESPONSE", success: false, error: chrome.runtime.lastError.message }, "*");
          return;
        }
        window.postMessage({ type: "FA_FILL_RESPONSE", success: !!(response && response.success) }, "*");
      });
    }

    // Ask background to fetch the form HTML (background has no CORS restrictions)
    if (e.data.type === "FA_FETCH_REQUEST") {
      console.log("[FormAgent Bridge] relaying fetch request to background");
      chrome.runtime.sendMessage({ action: "FETCH_FORM", url: e.data.url }, function(response) {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: "FA_FETCH_RESPONSE", success: false, error: chrome.runtime.lastError.message }, "*");
          return;
        }
        if (response && response.success) {
          window.postMessage({ type: "FA_FETCH_RESPONSE", success: true, html: response.html }, "*");
        } else {
          window.postMessage({ type: "FA_FETCH_RESPONSE", success: false, error: (response && response.error) || "Fetch failed" }, "*");
        }
      });
    }
  });

  // Forward progress events from background to website
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === "FILL_PROGRESS") {
      window.postMessage({ type: "FA_PROGRESS", event: message.event, data: message.data }, "*");
    }
  });
})();
