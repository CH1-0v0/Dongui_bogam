// Copy an explicit public allowlist. Never copy the checkout or environment files.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const files={'assistant.js':'frontend/assistant.js','index.html':'frontend/index.html','app.js':'frontend/app.js','law-basis.js':'frontend/law-basis.js','basis-rules.json':'backend/basis-rules.json','style.css':'design/style.css','pdf-export.js':'frontend/pdf-export.js','hwpx-template.json':'design/hwpx-template.json'};
for(const [name,source] of Object.entries(files))fs.copyFileSync(path.join(root,source),path.join(out,name));
const templates=JSON.parse(fs.readFileSync(path.join(root,'design/quick-templates.json'),'utf8'));
if(!Array.isArray(templates)||templates.some(t=>typeof t.title!=='string'||typeof t.purpose!=='string'||!Array.isArray(t.items)))throw Error('Invalid quick templates');
fs.writeFileSync(path.join(out,'quick-templates.js'),'const quickTemplates = '+JSON.stringify(templates)+';\n');
fs.mkdirSync(path.join(out,'export-assets'));
for(const name of fs.readdirSync(path.join(root,'design/export-assets'))){
 if(/^[A-Za-z0-9._-]+\.(js|ttf|txt)$/.test(name))fs.copyFileSync(path.join(root,'design/export-assets',name),path.join(out,'export-assets',name));
}
console.log('Built public allowlist in dist/; no server, .env, tests or source-control files.');
