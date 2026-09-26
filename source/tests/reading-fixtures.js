function pdfFixture(pages=2){
  const objects=[],kids=[];
  for(let i=0;i<pages;i++)kids.push(`${4+i*2} 0 R`);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for(let i=0;i<pages;i++){
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);
    const text=`0.9 0.94 0.92 rg 30 700 540 90 re f 0.1 0.3 0.25 rg BT /F1 24 Tf 50 740 Td (Reading page ${i+1}) Tj ET 0 0 0 rg BT /F1 16 Tf 50 650 Td (Write your notes on this page.) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  let text='%PDF-1.4\n',offsets=[0];objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${body}\nendobj\n`;});
  const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
module.exports={pdfFixture};
