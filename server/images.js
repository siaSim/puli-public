// Validate JPEG structure and dimensions without running a costly image decoder.
export function jpegDimensions(bytes) {
 if(bytes.length<100||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
 let offset=2;
 while(offset+4<bytes.length){
  if(bytes[offset++]!==255)return null;
  while(bytes[offset]===255)offset++;
  const marker=bytes[offset++];
  if(marker===0xd9||marker===0xda)break;
  if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
  const length=(bytes[offset]<<8)|bytes[offset+1];if(length<2||offset+length>bytes.length)return null;
  if([0xc0,0xc1,0xc2].includes(marker)&&length>=8){
   const height=(bytes[offset+3]<<8)|bytes[offset+4],width=(bytes[offset+5]<<8)|bytes[offset+6];
   return width>0&&height>0&&width<=2000&&height<=2000?{width,height}:null;
  }
  offset+=length;
 }
 return null;
}
