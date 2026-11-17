/* Checks actual committed miniature artwork; deliberately fails until files uploaded. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const names=['vismund_cygnus','david','snoop_bugg','dr_newton_sparknic','mister_potts','jawshua_red_hawk'];
let problems=[];
function verify(relative,width,height){
 const file=path.join(__dirname,'..','assets','hero-tokens',relative);
 if(!fs.existsSync(file)){problems.push(relative+': missing');return;}
 const bytes=fs.readFileSync(file);
 const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
 if(bytes.length<24||!bytes.subarray(0,8).equals(pngSignature)){problems.push(relative+': not a PNG');return;}
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
 if(w!==width||h!==height)problems.push(relative+': expected '+width+'×'+height+', got '+w+'×'+h);
}
for(const name of names){
 verify(name+'_token.png',512,512);
 verify('portraits/'+name+'_miniature.png',768,864);
}
if(problems.length){console.error('Miniature assets are NOT ready:\n'+problems.map(x=>' - '+x).join('\n'));process.exitCode=1;}
else console.log('PASS: all 12 official hero images installed, PNG signatures and dimensions valid');
