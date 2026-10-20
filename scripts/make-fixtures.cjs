const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('node:fs');
const path = require('node:path');
const dest = process.argv[2];
if (!dest || !path.basename(dest).includes('Sandbox')) throw new Error('Sandbox directory required');
(async () => {
  for (const landscape of [false, true]) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (let i=1;i<=12;i++) {
      const p = pdf.addPage(landscape ? [842,595] : [595,842]);
      const {width:w,height:h}=p.getSize();
      p.drawText('Canvas PDF Viewcard', {x:48,y:h-85,size:28,font:bold,color:rgb(.13,.2,.32)});
      p.drawText(`PAGE ${i} / 12 - ${landscape?'LANDSCAPE':'PORTRAIT'}`, {x:48,y:h-120,size:16,font,color:rgb(.35,.4,.5)});
      p.drawRectangle({x:48,y:h-260,width:w-96,height:100,color:rgb(.88,.91,.98)});
      p.drawText(`Reading page ${i}`,{x:70,y:h-215,size:24,font:bold,color:rgb(.2,.3,.6)});
      for(let line=0;line<6;line++) p.drawText('Fit the page, change the layout, and read in the popup.',{x:48,y:h-310-line*28,size:12,font});
      p.drawText(`BOTTOM OF PAGE ${i}`,{x:48,y:32,size:12,font});
    }
    fs.writeFileSync(path.join(dest,landscape?'Landscape.pdf':'Portrait.pdf'),await pdf.save());
  }
  fs.writeFileSync(path.join(dest,'PDF Viewcard Test.canvas'),JSON.stringify({
    nodes:[
      {id:'pdf-a',type:'file',file:'Portrait.pdf',subpath:'#page=3',x:0,y:0,width:520,height:660},
      {id:'pdf-b',type:'file',file:'Portrait.pdf',subpath:'#page=7',x:620,y:0,width:400,height:440},
      {id:'pdf-c',type:'file',file:'Landscape.pdf',x:0,y:780,width:520,height:380},
      {id:'note-a',type:'text',text:'## 연결된 노트\\nPDF를 더블클릭해서 읽습니다.',x:-400,y:100,width:300,height:160}
    ],edges:[{id:'edge-a',fromNode:'note-a',fromSide:'right',toNode:'pdf-a',toSide:'left'}]
  },null,2));
})();
