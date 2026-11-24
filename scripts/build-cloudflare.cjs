// Copy an explicit public allowlist. Never copy the checkout or environment files.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const name of ['index.html','app.js','style.css','law-basis.js','basis-rules.json','pdf-export.js','hwpx-template.json'])fs.copyFileSync(path.join(root,name),path.join(out,name));
fs.mkdirSync(path.join(out,'export-assets'));
for(const name of fs.readdirSync(path.join(root,'export-assets'))){
 if(/^[A-Za-z0-9._-]+\.(js|ttf|txt)$/.test(name))fs.copyFileSync(path.join(root,'export-assets',name),path.join(out,'export-assets',name));
}
console.log('Built public allowlist in dist/; no server, .env, tests or source-control files.');
