const assets = new URL('./export-assets/', import.meta.url);
const [pageWidth, pageHeight] = [595.28, 841.89];
const margin = 45.35;
const contentWidth = pageWidth - 2 * margin;

function loadScript(name, globalName){
 if(globalThis[globalName])return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=new URL(name,assets);
  script.onload=resolve;
  script.onerror=()=>{script.remove();reject(new Error(name+' could not load'));};
  document.head.append(script);
 });
}

let dependencies;
function loadDependencies(){
 dependencies??=Promise.all([
  loadScript('pdf-lib.min.js','PDFLib'),
  loadScript('fontkit.umd.min.js','fontkit'),
  ...['Regular','Bold'].map(async weight=>{
   const response=await fetch(new URL('ConsentSans-'+weight+'.ttf',assets));
   if(!response.ok)throw new Error('PDF font could not load');
   return response.arrayBuffer();
  })
 ]).catch(error=>{dependencies=null;throw error;});
 return dependencies;
}

function wrapText(text,font,size,width){
 const lines=[];
 for(const paragraph of text.split(/\r?\n/)){
  let line='',lineWidth=0;
  for(let word of paragraph.match(/\S+|[^\S\n]+/g)||[]){
   word=word.replace(/\t/g,'    ');
   const wordWidth=font.widthOfTextAtSize(word,size);
   if(line&&lineWidth+wordWidth>width){
    lines.push(line.trimEnd());
    line='';lineWidth=0;
    if(!word.trim())continue;
   }
   if(wordWidth<=width){line+=word;lineWidth+=wordWidth;continue;}
   for(const char of word){
    const charWidth=font.widthOfTextAtSize(char,size);
    if(line&&lineWidth+charWidth>width){lines.push(line);line='';lineWidth=0;}
    line+=char;lineWidth+=charWidth;
   }
  }
  lines.push(line.trimEnd());
 }
 return lines;
}

const nodeText = node => node.textContent.replace(/\u00a0/g,' ').trim();

export async function createPdf(body,tableGrid){
 const [,,regularBytes,boldBytes]=await loadDependencies();
 const {PDFDocument,rgb}=globalThis.PDFLib;
 const pdf=await PDFDocument.create();
 pdf.registerFontkit(globalThis.fontkit);
 // Preserve the TrueType glyph order: runtime subsetting dropped Korean glyphs in PDF viewers.
 const [regular,bold]=await Promise.all([
  pdf.embedFont(regularBytes,{subset:false}),pdf.embedFont(boldBytes,{subset:false})
 ]);
 const ink=rgb(.10,.15,.23), blue=rgb(33/255,84/255,199/255), border=rgb(.56,.62,.71), fill=rgb(.94,.96,.99);
 let page,y;
 function nextPage(){page=pdf.addPage([pageWidth,pageHeight]);y=pageHeight-margin;}
 function room(height){if(y-height<margin)nextPage();}
 function draw(text,x,baseline,font,size,color,width=0,align='left'){
  if(!text)return;
  if(align==='center')x+=(width-font.widthOfTextAtSize(text,size))/2;
  if(align==='right')x+=width-font.widthOfTextAtSize(text,size);
  page.drawText(text,{x,y:baseline,font,size,color});
 }
 function paragraph(text,{font=regular,size=11,color=ink,align='left',after=8,keep=0,prefix=''}={}){
  const indent=prefix?font.widthOfTextAtSize(prefix+' ',size):0;
  const lines=wrapText(text,font,size,contentWidth-indent);
  const leading=size*1.5;
  room(Math.min(lines.length*leading+keep,pageHeight-2*margin));
  for(const [index,line] of lines.entries()){
   room(leading);
   if(prefix&&index===0)draw(prefix,margin,y-size,font,size,color);
   draw(line,margin+indent,y-size,font,size,color,contentWidth-indent,align);
   y-=leading;
  }
  y-=after;
 }
 function table(element){
  const heading=element.tHead?.rows[0];
  const widths=Array.from(heading.cells,cell=>{
   const text=nodeText(cell);
   return ['구분','처리 방식'].includes(text)?.55:text==='개인정보 항목'?1.25:1;
  });
  const total=widths.reduce((sum,width)=>sum+width,0);
  const columns=widths.map(width=>contentWidth*width/total);
  const padding=5, leading=16;
  function cellLines(cell,width,header){
   const lines=[{runs:[],width:0}];
   function add(text,important){
    const font=header||cell.tagName==='TH'||important?bold:regular,size=important?12.6:10.5,color=important?blue:ink;
    function append(part){
     const line=lines.at(-1),last=line.runs.at(-1);
     if(last&&last.font===font&&last.size===size&&last.color===color)last.text+=part;else line.runs.push({text:part,font,size,color});
     line.width+=font.widthOfTextAtSize(part,size);
    }
    for(const token of text.replace(/\r/g,'').match(/\n|[^\S\n]+|\S+/g)||[]){
     if(token==='\n'){lines.push({runs:[],width:0});continue;}
     const tokenWidth=font.widthOfTextAtSize(token,size);
     if(tokenWidth<=width){
      if(lines.at(-1).width+tokenWidth>width&&lines.at(-1).runs.length)lines.push({runs:[],width:0});
      if(token.trim()||lines.at(-1).runs.length)append(token);
     }else for(const char of token){
      if(lines.at(-1).width+font.widthOfTextAtSize(char,size)>width&&lines.at(-1).runs.length)lines.push({runs:[],width:0});
      append(char);
     }
    }
   }
   function visit(node){if(node.nodeType===3)add(node.textContent,Boolean(node.parentElement.closest('.doc-important')));else if(node.nodeType===1){if(node.tagName==='BR')add('\n',false);else for(const child of node.childNodes)visit(child);}}
   visit(cell);return lines;
  }
  function paintLine(line,x,baseline,width){let offset=x+(width-line.width)/2;for(const run of line.runs){draw(run.text,offset,baseline,run.font,run.size,run.color);offset+=run.font.widthOfTextAtSize(run.text,run.size);}}
  const prepare=(row,header=false)=>row.map((entry,index)=>({entry,size:12.6,lines:cellLines(entry.cell,columns[index]-2*padding,header)}));
  const count=cells=>Math.max(...cells.map(cell=>cell.lines.length));
  const height=n=>2*padding+n*leading;
  const grid=tableGrid(element);
  const head=prepare(grid[0],true);
  const headHeight=height(count(head));
  function drawRow(cells,start,length,isHeader=false,merged=[],part=0,combinedHeight=0){
   const rowHeight=height(length);
   let x=margin;
   cells.forEach(({font,size,color,lines},index)=>{
    const width=columns[index];
    const unified=merged.includes(index);
    if(unified&&part===2){x+=width;return;}
    const cellHeight=unified?combinedHeight:rowHeight;
    page.drawRectangle({x,y:y-cellHeight,width,height:cellHeight,borderWidth:.5,borderColor:border,...(isHeader?{color:fill}:{})});
    const visible=lines.slice(start,start+length);
    const offset=(cellHeight-height(visible.length))/2;
    visible.forEach((line,n)=>paintLine(line,x+padding,y-padding-offset-size-n*leading,width-2*padding));
    x+=width;
   });
   y-=rowHeight;
  }
  function repeatHead(){drawRow(head,0,count(head),true);}
  const rows=grid.slice(1).map(row=>prepare(row));
  // Lay out each logical row once. Spanning cells share one text cursor across
  // rows and page fragments, so common purposes and periods are never repeated.
  const rowLines=rows.map(row=>Math.max(1,...row.map(cell=>cell.entry.span===1?cell.lines.length:0)));
  rows.forEach((row,index)=>row.forEach(cell=>{
   if(cell.entry.start!==index+1||cell.entry.span===1)return;
   const last=Math.min(rows.length-1,index+cell.entry.span-1);
   const available=rowLines.slice(index,last+1).reduce((sum,n)=>sum+n,0);
   if(cell.lines.length>available)rowLines[last]+=cell.lines.length-available;
  }));
  room(headHeight+height(1));repeatHead();
  const cursors=new Map();let fragments=[],budget=y-margin;
  function flush(){
   if(!fragments.length)return;
   const top=y;
   for(let column=0;column<columns.length;column++){
    const x=margin+columns.slice(0,column).reduce((sum,n)=>sum+n,0);
    let start=0,offset=0;
    while(start<fragments.length){
     const cell=rows[fragments[start].row][column];let end=start+1;
     while(end<fragments.length&&rows[fragments[end].row][column].entry.cell===cell.entry.cell)end++;
     const cellHeight=fragments.slice(start,end).reduce((sum,f)=>sum+f.height,0);
     page.drawRectangle({x,y:top-offset-cellHeight,width:columns[column],height:cellHeight,borderWidth:.5,borderColor:border});
     const cursor=cursors.get(cell.entry.cell)||0;
     const capacity=Math.max(0,Math.floor((cellHeight-2*padding)/leading));
     const visible=cell.lines.slice(cursor,cursor+capacity);
     const center=(cellHeight-height(visible.length))/2;
     visible.forEach((line,n)=>paintLine(line,x+padding,top-offset-padding-center-cell.size-n*leading,columns[column]-2*padding));
     cursors.set(cell.entry.cell,cursor+visible.length);
     offset+=cellHeight;start=end;
    }
   }
   y-=fragments.reduce((sum,f)=>sum+f.height,0);fragments=[];
  }
  for(let row=0;row<rows.length;row++){
   let remaining=rowLines[row];
   while(remaining){
    const available=Math.floor((budget-2*padding)/leading);
    if(available<1){flush();nextPage();repeatHead();budget=y-margin;continue;}
    const lines=Math.min(remaining,available),part={row,height:height(lines)};
    fragments.push(part);budget-=part.height;remaining-=lines;
   }
  }
  flush();
  y-=10;
 }

 const documents=body.querySelectorAll('.doc');
 if(!documents.length)throw new Error('No document to export');
 pdf.setTitle(nodeText(documents[0].querySelector('h1')));
 pdf.setLanguage('ko-KR');
 for(const doc of documents){
  nextPage();
  for(const node of doc.querySelectorAll('h1,h3,table,p')){
   if(node.matches('h1'))paragraph(nodeText(node),{font:bold,size:17,color:blue,align:'center',after:12,keep:20});
   else if(node.matches('h3'))paragraph(nodeText(node),{font:bold,size:13,color:blue,after:5,keep:58});
   else if(node.matches('table'))table(node);
   else if(node.matches('.doc-agency'))paragraph(nodeText(node),{font:bold,size:15,align:'center'});
   else if(node.closest('.sign'))paragraph(nodeText(node),{align:'right'});
   else if(node.matches('.doc-marketing'))paragraph(nodeText(node),{font:bold,size:12.6,color:blue});
   else if(node.matches('.doc-note'))paragraph(nodeText(node).replace(/^※\s*/,''),{prefix:'※'});
   else if(node.matches('.doc-choice')){
    const [question,choices]=Array.from(node.children,nodeText);
    room(17);
    draw(question,margin,y-11,regular,11,ink);
    draw(choices,margin,y-11,bold,11,ink,contentWidth,'right');
    y-=29;
   }
   else paragraph(nodeText(node));
  }
 }
 const pages=pdf.getPages();
 if(pages.length>1)pages.forEach((pdfPage,index)=>{
  const label=(index+1)+' / '+pages.length;
  const size=9;
  pdfPage.drawText(label,{font:regular,size,color:ink,x:(pageWidth-regular.widthOfTextAtSize(label,size))/2,y:margin/2});
 });
 return new Blob([await pdf.save()],{type:'application/pdf'});
}
