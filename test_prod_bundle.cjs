const https = require('https');

async function checkProduction() {
  const res = await fetch('https://capiconversa.com/app/crm');
  const html = await res.text();
  console.log('CRM HTML length:', html.length);
  const re = /src="([^"]+\.js)"/g;
  let match;
  const jsFiles = [];
  while ((match = re.exec(html)) !== null) {
    jsFiles.push(match[1]);
  }
  console.log('Found JS files:', jsFiles);
  for (const f of jsFiles) {
    const url = f.startsWith('http') ? f : 'https://capiconversa.com' + f;
    const txt = await (await fetch(url)).text();
    const hasCopilot = txt.includes('Copilot del Embudo') || txt.includes('crm.pipeline_copilot') || txt.includes('CrmCopilotSheet');
    console.log(f, 'hasCopilot:', hasCopilot, 'len:', txt.length);
  }
}

checkProduction().catch(console.error);
