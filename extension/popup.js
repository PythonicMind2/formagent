chrome.tabs.query({active:true,currentWindow:true},function(tabs){
  var el = document.getElementById("st");
  if(tabs[0] && tabs[0].url && tabs[0].url.includes("docs.google.com/forms")){
    el.textContent = "✓ Google Form detected!";
  }
});
