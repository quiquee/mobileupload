const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('public/upload.html', 'utf8');
const dom = new JSDOM(html, {
  url: "http://127.0.0.1:3456/upload?id=123&docType=nie",
  runScripts: "dangerously",
  beforeParse(window) {
    window.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
    window.setStatus = () => {};
  }
});
console.log("Error count:", (dom.window.document.errors || []).length);
console.log("Title text:", dom.window.document.getElementById('doc-title').textContent);
console.log("Steps display:", dom.window.document.getElementById('steps-wrap').style.display);
console.log("Sample container html length:", dom.window.document.getElementById('sample-img-container').innerHTML.length);
