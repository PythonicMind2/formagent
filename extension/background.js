// FormAgent — Background Service Worker
// Background has NO CORS restrictions — can fetch any URL freely

chrome.runtime.onMessageExternal.addListener(function(message, sender, sendResponse) {
  if (message.action === "PING") {
    sendResponse({ status: "ok", version: "1.0.0" });
    return true;
  }
  if (message.action === "FILL_FORM") {
    handleFillForm(message.data, sendResponse);
    return true;
  }
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {

  // AI request — background has full network access, no CORS
  if (message.action === "AI_REQUEST") {
    fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: message.body
    })
    .then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then(function(text) {
      sendResponse({ success: true, text: text });
    })
    .catch(function(err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // POST to AI — background has no CORS restrictions
  if (message.action === "AI_POST") {
    fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: message.body
    })
    .then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then(function(text) {
      sendResponse({ success: true, text: text });
    })
    .catch(function(err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Fetch form HTML — background has full network access, no CORS
  if (message.action === "FETCH_FORM") {
    console.log("[FormAgent BG] fetching:", message.url);
    fetch(message.url)
      .then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function(html) {
        console.log("[FormAgent BG] fetch success, length:", html.length);
        sendResponse({ success: true, html: html });
      })
      .catch(function(err) {
        console.error("[FormAgent BG] fetch error:", err.message);
        sendResponse({ success: false, error: err.message });
      });
    return true; // keep channel open for async
  }

  // Fill form request (from bridge)
  if (message.action === "FILL_FORM") {
    handleFillForm(message.data, sendResponse);
    return true;
  }

  // Progress forwarding from content script back to website
  if (message.action === "FILL_PROGRESS") {
    chrome.storage.session.get(["websiteTabId"], function(r) {
      if (r.websiteTabId) {
        chrome.tabs.sendMessage(r.websiteTabId, message).catch(function(){});
      }
    });
  }
});

function handleFillForm(data, sendResponse) {
  var formUrl   = data.formUrl;
  var answers   = data.answers;
  var questions = data.questions || [];

  // Remember website tab for progress forwarding
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0]) chrome.storage.session.set({ websiteTabId: tabs[0].id });
  });

  chrome.tabs.create({ url: formUrl, active: true }, function(tab) {
    var tabId = tab.id;
    console.log("[FormAgent BG] opened tab:", tabId);

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        console.log("[FormAgent BG] tab loaded, injecting in 2.5s");

        setTimeout(function() {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: function(answers, questions) {
              window.__FA_ANSWERS__  = answers;
              window.__FA_QUESTIONS__ = questions;
              window.__FA_READY__ = true;
              console.log("[FormAgent] data injected:", answers.length, "answers");
              window.dispatchEvent(new CustomEvent("formagent:start"));
            },
            args: [answers, questions]
          }).then(function() {
            console.log("[FormAgent BG] injection OK");
          }).catch(function(e) {
            console.error("[FormAgent BG] injection failed:", e.message);
          });
        }, 2500);
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(function() { chrome.tabs.onUpdated.removeListener(onUpdated); }, 30000);
    sendResponse({ success: true, tabId: tabId });
  });
}
